import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  AndroidReaderMode,
  AttendanceOverrideScope,
  CardStatus,
  DeviceReaderStatus,
  GateDirection,
  OverrideApprovalStatus,
  PrayerType,
  Prisma,
  ReaderType,
  ReconciliationFlagType,
  ReconciliationPriority,
  Role
} from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import type { RequestMeta } from '../../common/request-meta';
import { API_ERROR_CODES } from '@schoolhub/shared';
import { writeAudit } from '../../common/audit-log';
import { writeLiveMonitorOutboxEvent } from '../../common/outbox-event';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessPolicyService } from '../security/access-policy.service';
import { canonicalJson } from '../security/canonical-json';
import { DeviceSignatureService, readerCandidateWhere, readerLookupLimit, sha256Hex, uniqueReaderMatch, type ReaderSignatureHeaders } from '../security/device-signature.service';
import { assertReasonQuality, normalizeReason } from '../security/reason-policy';
import { StepUpAuthService } from '../security/step-up-auth.service';
import { QrCredentialsService } from '../qr-credentials/qr-credentials.service';
import { redactQr } from '../qr-credentials/qr-code.util';
import { MobileAndroidService } from '../mobile/mobile-android.service';
import { businessDateKey, businessWeekday, jakartaBusinessDayBounds, localDateTimeToUtc, localMinutesOfDay } from '../../common/business-time';
import { CreateAttendanceOverrideDto, DeviceGateEventDto, QrReaderScanDto, QrScanDto, ReaderScanDto, ReviewAttendanceOverrideDto, TapGateDto, UpdateAttendancePolicyDto } from './attendance-gate.dto';

const VALID_OVERRIDE_SCOPES = new Set(Object.values(AttendanceOverrideScope));
const MIN_GATE_STAY_MINUTES = Number(process.env.MIN_GATE_STAY_MINUTES ?? '10');
const STEP_UP_FOR_POLICY = process.env.STEP_UP_FOR_POLICY === 'true';
const WRONG_SCAN_MODE_MESSAGE = 'QR tidak cocok untuk mode scan ini. Ubah mode HP terlebih dahulu.';
const GATE_QR_ANDROID_MODES = new Set<AndroidReaderMode>([AndroidReaderMode.GERBANG, AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT]);
const VALID_QR_ANDROID_MODES = new Set<AndroidReaderMode>([AndroidReaderMode.GERBANG, AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY]);
function dayBounds(value: Date | string = new Date()) {
  return jakartaBusinessDayBounds(value);
}

function dateOnly(value: Date | string = new Date()) {
  return jakartaBusinessDayBounds(value).date;
}

function gateBusinessDate(value: Date) {
  const [year, month, day] = businessDateKey(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function endOfDay(value: Date | string = new Date()) {
  return jakartaBusinessDayBounds(value).end;
}

function minutesOf(time: string | null | undefined, fallback: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return hour * 60 + minute;
}

type PrayerClassification = {
  prayerType: PrayerType | 'OUTSIDE_WINDOW';
  currentWindow: { prayerType: PrayerType; startMinute: number; endMinute: number } | null;
  nextWindow: { prayerType: PrayerType; startMinute: number; endMinute: number } | null;
};

function formatMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function scannedPrayerType(scannedAt: Date, policy: { dhuhaStartTime: string; dhuhaEndTime: string; dzuhurStartTime: string; dzuhurEndTime: string; asharStartTime?: string; asharEndTime?: string }): PrayerClassification {
  const minute = localMinutesOfDay(scannedAt);
  const windows = [
    { prayerType: PrayerType.DHUHA, startMinute: minutesOf(policy.dhuhaStartTime, 7 * 60), endMinute: minutesOf(policy.dhuhaEndTime, 10 * 60 + 30) },
    { prayerType: PrayerType.DZUHUR, startMinute: minutesOf(policy.dzuhurStartTime, 11 * 60 + 45), endMinute: minutesOf(policy.dzuhurEndTime, 13 * 60 + 30) },
    { prayerType: PrayerType.ASHAR, startMinute: minutesOf(policy.asharStartTime || '15:00', 15 * 60), endMinute: minutesOf(policy.asharEndTime || '16:30', 16 * 60 + 30) }
  ];
  const currentWindow = windows.find((window) => minute >= window.startMinute && minute <= window.endMinute) ?? null;
  const nextWindow = windows.find((window) => minute < window.startMinute) ?? null;
  return { prayerType: currentWindow?.prayerType ?? 'OUTSIDE_WINDOW', currentWindow, nextWindow };
}

function isStaffRole(role: Role) {
  return role === Role.ADMIN_TU || role === Role.OPERATOR_IT || role === Role.GURU_PIKET || role === Role.DEVELOPER;
}

function gateDirectionLabel(direction: GateDirection) {
  return direction === GateDirection.IN ? 'Datang' : 'Pulang';
}

function prayerLabel(prayerType: PrayerType) {
  return prayerType === PrayerType.DHUHA ? 'Dhuha' : prayerType === PrayerType.DZUHUR ? 'Dzuhur' : 'Ashar';
}

function scanModeLabel(mode?: AndroidReaderMode | null) {
  if (!mode) return null;
  if (mode === AndroidReaderMode.MUSHOLA) return 'Mushola';
  if (mode === AndroidReaderMode.CHECK_ONLY) return 'Cek Saja';
  if (GATE_QR_ANDROID_MODES.has(mode)) return 'Gerbang';
  return String(mode).replace('_', ' ');
}

function canReviewOverride(role: Role) {
  return role === Role.ADMIN_TU || role === Role.DEVELOPER;
}

function parseScope(value?: string | null) {
  const scope = String(value || AttendanceOverrideScope.CLASS_ELIGIBILITY).trim() as AttendanceOverrideScope;
  if (!VALID_OVERRIDE_SCOPES.has(scope)) throw new BadRequestException('Scope override tidak valid.');
  return scope;
}

interface ScanActor {
  sub: string;
  role: Role;
}

interface RecordOptions {
  manualReason?: string;
  cardId?: string | null;
  readerId?: string | null;
  deviceId?: string | null;
  signatureVerified?: boolean;
  nonceHash?: string | null;
  bodyHash?: string | null;
  usedOverrideId?: string | null;
  qrCredentialId?: string | null;
  scanMode?: AndroidReaderMode | null;
  appVersion?: string | null;
  appVersionCode?: number | null;
  deviceEventId?: string | null;
  deviceTimestamp?: Date | null;
}

@Injectable()
export class AttendanceGateService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly signatures?: DeviceSignatureService,
    @Optional() private readonly accessPolicy?: AccessPolicyService,
    @Optional() private readonly stepUp?: StepUpAuthService,
    @Optional() private readonly qrCredentials?: QrCredentialsService,
    @Optional() private readonly mobileAndroid?: MobileAndroidService
  ) {}

  async getAttendancePolicy() {
    const existing = await this.prisma.attendancePolicy.findUnique({ where: { id: 1 } });
    if (existing) return existing;
    return this.prisma.attendancePolicy.create({ data: { id: 1 } });
  }

  async updateAttendancePolicy(payload: UpdateAttendancePolicyDto, actor: ScanActor) {
    if (STEP_UP_FOR_POLICY) await this.stepUp?.assertRecentPassword(actor.sub, payload.stepUpPassword);
    const { stepUpPassword: _stepUpPassword, ...data } = payload;
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.attendancePolicy.findUnique({ where: { id: 1 } });
      const updated = await tx.attendancePolicy.upsert({
        where: { id: 1 },
        update: data,
        create: { id: 1, ...data }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'attendance',
        action: 'attendance.policy.updated',
        resource: 'attendancePolicy',
        resourceId: '1',
        before: before as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue
      });
      return updated;
    });
  }

  async listLogs(pagination: PaginationQuery, date?: string, userId?: string) {
    const where: Prisma.GateLogWhereInput = {};

    if (date) {
      const { start, end } = dayBounds(date);
      where.tappedAt = { gte: start, lte: end };
    }

    if (userId) where.userId = userId;

    const [total, items] = await Promise.all([
      this.prisma.gateLog.count({ where }),
      this.prisma.gateLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, username: true, role: true } }
        },
        orderBy: { tappedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);
    const readerMap = await this.readerNameMap(items.map((item) => item.readerId));

    return {
      items: items.map((item) => ({
        ...item,
        deviceName: (item.readerId ? readerMap.get(item.readerId)?.name : null) ?? item.deviceId ?? '—',
        scanModeLabel: scanModeLabel(item.scanMode) ?? 'Gerbang',
        resultLabel: gateDirectionLabel(item.direction)
      })),
      meta: buildPaginationMeta(total, pagination)
    };
  }

  async listPrayerLogs(pagination: PaginationQuery, date?: string, studentId?: string) {
    const where: Prisma.PrayerAttendanceLogWhereInput = {};
    if (date) where.attendanceDate = dateOnly(date);
    if (studentId) where.studentId = studentId;
    const [total, items] = await Promise.all([
      this.prisma.prayerAttendanceLog.count({ where }),
      this.prisma.prayerAttendanceLog.findMany({
        where,
        include: {
          student: { select: { id: true, fullName: true, username: true, role: true } },
          createdBy: { select: { id: true, fullName: true, role: true } }
        },
        orderBy: { scannedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);
    const readerMap = await this.readerNameMap(items.map((item) => item.readerId));
    return {
      items: items.map((item) => ({
        ...item,
        deviceName: (item.readerId ? readerMap.get(item.readerId)?.name : null) ?? item.deviceId ?? '—',
        scanModeLabel: scanModeLabel(item.scanMode) ?? 'Mushola',
        resultLabel: 'Sholat'
      })),
      meta: buildPaginationMeta(total, pagination)
    };
  }

  private async readerNameMap(readerIds: Array<string | null | undefined>) {
    const ids = Array.from(new Set(readerIds.filter(Boolean))) as string[];
    if (!ids.length) return new Map<string, { id: string; name: string; locationName?: string | null; locationLabel?: string | null }>();
    const readers = await this.prisma.deviceReader.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, locationName: true, locationLabel: true } });
    return new Map(readers.map((reader) => [reader.id, reader]));
  }

  async tap(payload: TapGateDto, actor: ScanActor) {
    const reason = assertReasonQuality(payload.reason, 'Alasan input tap manual');
    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.active) throw new NotFoundException('Pengguna tidak ditemukan atau tidak aktif.');
    if (this.accessPolicy && !await this.accessPolicy.canScanManual(actor, user.id, payload.direction === GateDirection.OUT ? AttendanceOverrideScope.GATE_OUT : AttendanceOverrideScope.GATE_IN)) {
      throw new ForbiddenException('Input tap manual ditolak.');
    }
    return this.recordGateScan(user.id, payload.direction, new Date(), { sub: actor.sub, role: actor.role }, {
      manualReason: reason,
      deviceId: payload.deviceId ?? null
    }, user.role);
  }

  async qrScan(payload: QrScanDto, actor: ScanActor) {
    const scannedAt = new Date();
    const policy = await this.getAttendancePolicy();
    if (!policy.legacyQrScanEnabled) throw new ForbiddenException('Jalur QR manual/legacy sedang dinonaktifkan. Gunakan APK Android reader resmi.');
    const manualReason = assertReasonQuality(payload.manualReason, 'Alasan scan manual');
    const readerCandidates = payload.readerId
      ? await this.prisma.deviceReader.findMany({ where: readerCandidateWhere(payload.readerId), take: readerLookupLimit() })
      : [];
    const readerMatch = payload.readerId ? uniqueReaderMatch(readerCandidates, payload.readerId) : { status: 'not_found' as const };
    if (payload.readerId && readerMatch.status !== 'matched') throw new ForbiddenException('Reader tidak aktif, dicabut, atau tidak ditemukan.');
    const reader = readerMatch.status === 'matched' ? readerMatch.reader : null;
    if (reader && reader.status !== DeviceReaderStatus.ACTIVE) throw new ForbiddenException('Reader tidak aktif.');
    const readerType = reader?.type ?? payload.readerType ?? ReaderType.MANUAL;
    const deviceId = reader?.id ?? payload.deviceId ?? payload.readerId ?? null;

    const card = payload.cardUid
      ? await this.prisma.smartCard.findUnique({ where: { uid: payload.cardUid }, include: { user: true } })
      : null;

    if (payload.cardUid && (!card || card.status !== CardStatus.ACTIVE || !card.user)) {
      throw new NotFoundException('QR/kartu tidak ditemukan atau tidak aktif.');
    }

    const user = card?.user ?? (payload.userId ? await this.prisma.user.findUnique({ where: { id: payload.userId } }) : null);
    if (!user || !user.active) throw new NotFoundException('Pengguna tidak ditemukan atau tidak aktif.');
    if (this.accessPolicy && !await this.accessPolicy.canScanManual(actor, user.id, payload.overrideScope)) throw new ForbiddenException('Input manual hanya boleh dilakukan petugas.');

    if (readerType === ReaderType.MUSHOLA) {
      throw new ForbiddenException('Scan mushola wajib melalui reader resmi bersignature. Gunakan override manual bila perlu.');
    }

    if (readerType === ReaderType.CLASS || readerType === ReaderType.MANUAL) {
      if (user.role !== Role.SISWA) throw new ForbiddenException('Verifikasi manual hanya untuk siswa.');
      const overrideScope = payload.overrideScope || (payload.direction === GateDirection.OUT ? AttendanceOverrideScope.ASHAR_CHECKOUT : AttendanceOverrideScope.CLASS_ELIGIBILITY);
      return this.createOverride({ studentId: user.id, date: scannedAt.toISOString(), scope: overrideScope, reason: manualReason }, actor);
    }

    const direction = payload.direction ?? GateDirection.IN;
    return this.recordGateScan(user.id, direction, scannedAt, { sub: actor.sub, role: actor.role }, {
      manualReason,
      cardId: card?.id ?? null,
      readerId: reader?.id ?? null,
      deviceId
    }, user.role);
  }

  async deviceGateEvent(payload: DeviceGateEventDto, signed: { deviceId?: string; method: string; path: string }) {
    if (!this.signatures) throw new ForbiddenException('Verifikasi signature reader belum tersedia.');
    const bodyForSignature = canonicalJson({
      eventId: payload.eventId,
      cardUid: payload.cardUid,
      direction: payload.direction,
      deviceTimestamp: payload.deviceTimestamp,
      nonce: payload.nonce,
      firmwareVersion: payload.firmwareVersion ?? null
    });
    const bodyHash = sha256Hex(bodyForSignature);
    const headers = {
      deviceId: signed.deviceId,
      timestamp: payload.deviceTimestamp,
      nonce: payload.nonce,
      bodyHash,
      signature: payload.signature
    } satisfies ReaderSignatureHeaders;
    const parsedDeviceTimestamp = new Date(payload.deviceTimestamp);
    const rejectedBase = {
      eventId: payload.eventId,
      cardUid: payload.cardUid,
      direction: payload.direction,
      deviceTimestamp: parsedDeviceTimestamp,
      deviceId: signed.deviceId ?? null,
      bodyHash
    };

    try {
      const verification = await this.signatures.assertValidSignedReaderRequest({
        method: signed.method,
        path: signed.path,
        rawBody: bodyForSignature,
        expectedType: ReaderType.GATE,
        headers
      });

      const existing = await this.prisma.gateLog.findUnique({ where: { deviceEventId: payload.eventId } });
      if (existing) return { kind: 'GATE', duplicate: true, message: 'Event gate sudah pernah diterima.', item: existing };

      const card = await this.prisma.smartCard.findUnique({ where: { uid: payload.cardUid }, include: { user: true } });
      if (!card || card.status !== CardStatus.ACTIVE || !card.user || !card.user.active) {
        await this.prisma.rejectedDeviceScan.create({ data: { ...rejectedBase, readerId: verification.reader.id, nonceHash: verification.nonceHash, reason: 'CARD_INACTIVE_OR_UNLINKED' } });
        await this.securityAudit('attendance.device.gate.rejected_card', verification.reader.id, { eventId: payload.eventId, cardUid: payload.cardUid });
        throw new NotFoundException('Kartu tidak ditemukan, tidak aktif, atau belum tertaut ke pengguna aktif.');
      }

      const actor = { sub: `reader:${verification.reader.id}`, role: Role.OPERATOR_IT };
      return this.recordGateScan(card.user.id, payload.direction, new Date(), actor, {
        cardId: card.id,
        readerId: verification.reader.id,
        deviceId: verification.reader.deviceId ?? verification.reader.id,
        signatureVerified: true,
        nonceHash: verification.nonceHash,
        bodyHash: verification.bodyHash,
        appVersion: payload.firmwareVersion ?? null,
        deviceEventId: payload.eventId,
        deviceTimestamp: verification.timestamp
      }, card.user.role);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        await this.prisma.rejectedDeviceScan.create({ data: { ...rejectedBase, reason: error instanceof Error ? error.message.slice(0, 180) : 'UNKNOWN_REJECTION' } }).catch(() => null);
      }
      throw error;
    }
  }

  async readerScan(payload: ReaderScanDto, signed: ReaderSignatureHeaders & { method: string; path: string }) {
    if (!this.signatures) throw new ForbiddenException('Verifikasi signature reader belum tersedia.');
    const bodyForHash = canonicalJson(payload);
    const verification = await this.signatures.assertValidSignedReaderRequest({
      method: signed.method,
      path: signed.path,
      rawBody: bodyForHash,
      headers: signed
    });
    const scannedAt = new Date();
    const card = await this.prisma.smartCard.findUnique({ where: { uid: payload.cardUid }, include: { user: true } });
    if (!card || card.status !== CardStatus.ACTIVE || !card.user || !card.user.active) {
      await this.securityAudit('attendance.reader.scan.rejected_card_inactive', verification.reader.id, { cardUid: payload.cardUid });
      throw new NotFoundException('QR/kartu tidak ditemukan atau tidak aktif.');
    }

    const actor = { sub: `reader:${verification.reader.id}`, role: Role.OPERATOR_IT };
    const commonOptions: RecordOptions = {
      cardId: card.id,
      readerId: verification.reader.id,
      deviceId: verification.reader.id,
      signatureVerified: true,
      nonceHash: verification.nonceHash,
      bodyHash: verification.bodyHash
    };

    if (verification.reader.type === ReaderType.GATE) {
      const direction = payload.direction ?? GateDirection.IN;
      return this.recordGateScan(card.user.id, direction, scannedAt, actor, commonOptions, card.user.role);
    }

    if (verification.reader.type === ReaderType.MUSHOLA) {
      if (card.user.role !== Role.SISWA) throw new ForbiddenException('Scan mushola hanya untuk siswa.');
      const policy = await this.getAttendancePolicy();
      const classification = scannedPrayerType(scannedAt, policy);
      if (classification.prayerType === 'OUTSIDE_WINDOW') {
        return this.rejectPrayerOutsideWindow(card.user.id, scannedAt, ReaderType.MUSHOLA, actor, commonOptions, classification);
      }
      return this.recordPrayerScan(card.user.id, classification.prayerType, scannedAt, ReaderType.MUSHOLA, actor, commonOptions);
    }

    throw new ForbiddenException('Tipe reader belum didukung untuk scan resmi.');
  }

  async qrReaderScan(payload: QrReaderScanDto, signed: ReaderSignatureHeaders & { method: string; path: string }) {
    if (!this.signatures || !this.qrCredentials) throw new ForbiddenException('Verifikasi QR reader belum tersedia.');
    const version = this.mobileAndroid ? await this.mobileAndroid.getAndroidReaderVersion() : { minSupportedVersionCode: 1 };
    const bodyForHash = canonicalJson(payload);
    const verification = await this.signatures.assertValidSignedReaderRequest({
      method: signed.method,
      path: signed.path,
      rawBody: bodyForHash,
      expectedType: ReaderType.QR_ANDROID,
      minSupportedVersionCode: version.minSupportedVersionCode,
      appVersionCode: payload.appVersionCode,
      headers: signed
    });
    const requestedMode = payload.scanMode ?? payload.mode;
    if (!requestedMode || !VALID_QR_ANDROID_MODES.has(requestedMode)) {
      await this.logRejectedQrReaderScan(verification, requestedMode ?? null, 'UNSUPPORTED_SCAN_MODE');
      await this.securityAudit('attendance.qr.reader.scan.denied_wrong_mode', verification.reader.id, { mode: requestedMode ?? null });
      throw new BadRequestException('Mode scan QR tidak didukung.');
    }
    const scannedAt = new Date();
    const credential = await this.qrCredentials.findActiveByQrCode(payload.qrCode).catch(async (error) => {
      await this.logRejectedQrReaderScan(verification, requestedMode, 'QR_CREDENTIAL_REJECTED');
      await this.securityAudit('attendance.qr.reader.scan.rejected', verification.reader.id, { reason: error.message, qrMasked: redactQr(payload.qrCode), mode: requestedMode });
      throw error;
    }) as any;
    const user = credential.user;
    const actor = { sub: `reader:${verification.reader.id}`, role: Role.OPERATOR_IT };
    const commonOptions: RecordOptions = {
      readerId: verification.reader.id,
      deviceId: verification.reader.deviceId ?? verification.reader.id,
      signatureVerified: true,
      nonceHash: verification.nonceHash,
      bodyHash: verification.bodyHash,
      qrCredentialId: credential.id,
      scanMode: requestedMode,
      appVersion: payload.appVersion ?? verification.reader.appVersion ?? null,
      appVersionCode: payload.appVersionCode ?? verification.reader.appVersionCode ?? null
    };

    if (requestedMode === AndroidReaderMode.CHECK_ONLY) {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.deviceReader.update({ where: { id: verification.reader.id }, data: { lastSeenAt: scannedAt, lastSignedScanAt: scannedAt, currentMode: requestedMode, appVersion: payload.appVersion ?? verification.reader.appVersion, appVersionCode: payload.appVersionCode ?? verification.reader.appVersionCode } });
        await tx.qrCredential.update({ where: { id: credential.id }, data: { lastUsedAt: scannedAt } });
        await writeAudit(tx, {
          actorId: actor.sub,
          actorRole: actor.role,
          module: 'attendance',
          action: 'attendance.qr.reader.scan.accepted',
          resource: 'qrCredential',
          resourceId: credential.id,
          after: { mode: requestedMode, qrMasked: redactQr(payload.qrCode), userId: user.id, readerId: verification.reader.id, checkOnly: true } as Prisma.InputJsonValue
        });
        return true;
      });
      return { kind: 'CHECK_ONLY', ok: result, readOnly: true, attendanceRecorded: false, message: 'QR valid. Tidak ada presensi yang dicatat.', user: this.scanUserPayload(user, true), serverTime: scannedAt.toISOString() };
    }

    if (GATE_QR_ANDROID_MODES.has(requestedMode)) {
      const result = await this.recordQrAndroidGateScan(user.id, user.role, scannedAt, actor, commonOptions, requestedMode);
      await this.securityAudit('attendance.qr.reader.scan.accepted', result.item.id, { mode: requestedMode, action: result.action, userId: user.id, qrCredentialId: credential.id, readerId: verification.reader.id, idempotent: Boolean((result as { idempotent?: boolean }).idempotent) });
      return { ...result, ok: true, user: this.scanUserPayload(user), serverTime: scannedAt.toISOString() };
    }

    if (requestedMode === AndroidReaderMode.MUSHOLA) {
      if (user.role !== Role.SISWA) {
        await this.logRejectedQrReaderScan(verification, requestedMode, 'MUSHOLA_NON_STUDENT');
        await this.securityAudit('attendance.qr.reader.scan.rejected', verification.reader.id, { reason: 'Mushola hanya untuk siswa', userId: user.id, mode: requestedMode });
        throw new ForbiddenException(WRONG_SCAN_MODE_MESSAGE);
      }
      const policy = await this.getAttendancePolicy();
      const classification = scannedPrayerType(scannedAt, policy);
      if (classification.prayerType === 'OUTSIDE_WINDOW') {
        return this.rejectPrayerOutsideWindow(user.id, scannedAt, ReaderType.QR_ANDROID, actor, commonOptions, classification);
      }
      const result = await this.recordPrayerScan(user.id, classification.prayerType, scannedAt, ReaderType.QR_ANDROID, actor, commonOptions);
      await this.securityAudit('attendance.qr.reader.scan.accepted', result.item.id, { mode: requestedMode, prayerType: classification.prayerType, userId: user.id, qrCredentialId: credential.id, readerId: verification.reader.id });
      return { ...result, ok: true, user: this.scanUserPayload(user), serverTime: scannedAt.toISOString() };
    }

    throw new BadRequestException('Mode scan QR tidak didukung.');
  }

  private async logRejectedQrReaderScan(
    verification: { reader: { id: string; deviceId?: string | null }; nonceHash: string; bodyHash: string },
    scanMode: AndroidReaderMode | null,
    reason: string
  ) {
    await this.prisma.rejectedDeviceScan.create({
      data: {
        readerId: verification.reader.id,
        deviceId: verification.reader.deviceId ?? verification.reader.id,
        scanMode: scanMode && VALID_QR_ANDROID_MODES.has(scanMode) ? scanMode : null,
        nonceHash: verification.nonceHash,
        bodyHash: verification.bodyHash,
        reason
      }
    }).catch(() => null);
  }

  private async touchSuccessfulReaderScan(scannedAt: Date, options: RecordOptions) {
    await this.prisma.$transaction(async (tx) => {
      if (options.qrCredentialId) await tx.qrCredential.update({ where: { id: options.qrCredentialId }, data: { lastUsedAt: scannedAt } });
      if (options.readerId || options.deviceId) {
        await tx.deviceReader.updateMany({
          where: options.readerId ? { id: options.readerId } : { deviceId: options.deviceId ?? '' },
          data: { lastSeenAt: scannedAt, appVersion: options.appVersion ?? undefined, appVersionCode: options.appVersionCode ?? undefined, currentMode: options.scanMode ?? undefined, ...(options.signatureVerified ? { lastSignedScanAt: scannedAt } : {}) }
        });
      }
    });
  }

  private async recordQrAndroidGateScan(userId: string, role: Role, scannedAt: Date, actor: ScanActor, options: RecordOptions, requestedMode: AndroidReaderMode) {
    const businessDate = gateBusinessDate(scannedAt);
    const logs = await this.prisma.gateLog.findMany({
      where: { userId, businessDate },
      orderBy: { tappedAt: 'asc' }
    });
    const firstIn = logs.find((item) => item.direction === GateDirection.IN) ?? null;
    const firstOut = logs.find((item) => item.direction === GateDirection.OUT) ?? null;

    if (!firstIn) {
      const result = await this.recordGateScan(userId, GateDirection.IN, scannedAt, actor, { ...options, scanMode: requestedMode }, role);
      return { ...result, message: 'Datang tercatat.', action: 'Datang' };
    }

    if (firstOut) {
      await this.touchSuccessfulReaderScan(scannedAt, options);
      await this.securityAudit('attendance.qr.reader.scan.idempotent_gate_out', firstOut.id, { userId, businessDate: businessDate.toISOString() });
      return { kind: 'GATE', message: 'Sudah tercatat.', item: firstOut, idempotent: true, action: 'Pulang' };
    }

    const minutesSinceIn = Math.floor((scannedAt.getTime() - firstIn.tappedAt.getTime()) / 60000);
    if (minutesSinceIn < MIN_GATE_STAY_MINUTES) {
      await this.touchSuccessfulReaderScan(scannedAt, options);
      await this.securityAudit('attendance.qr.reader.scan.idempotent_gate_in', firstIn.id, { userId, minutesSinceIn, minimumMinutes: MIN_GATE_STAY_MINUTES });
      return { kind: 'GATE', message: 'Sudah tercatat.', item: firstIn, idempotent: true, action: 'Datang' };
    }

    const result = await this.recordGateScan(userId, GateDirection.OUT, scannedAt, actor, { ...options, scanMode: requestedMode }, role);
    return { ...result, message: 'Pulang tercatat.', action: 'Pulang' };
  }

  private scanUserPayload(user: { id: string; fullName: string; username: string; nis?: string | null; nip?: string | null; birthDate?: Date | null; role: Role; active?: boolean; cardStatus?: CardStatus | null; enrollments?: Array<{ schoolClass?: { code?: string; name?: string } | null }> }, includeBiodata = false) {
    const schoolClass = includeBiodata && user.role === Role.SISWA ? user.enrollments?.[0]?.schoolClass : user.role === Role.SISWA ? null : user.enrollments?.[0]?.schoolClass;
    const base = { id: user.id, fullName: user.fullName, username: user.username, role: user.role, active: user.active ?? true, cardStatus: user.cardStatus ?? null, className: schoolClass?.name || schoolClass?.code || null };
    if (!includeBiodata) return base;
    return {
      fullName: user.fullName,
      role: user.role,
      active: user.active ?? true,
      cardStatus: user.cardStatus ?? null,
      className: schoolClass?.name || schoolClass?.code || null,
      nis: user.role === Role.SISWA ? user.nis ?? null : null,
      nip: user.role === Role.SISWA ? null : user.nip ?? null,
      birthDate: user.role === Role.SISWA && user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null
    };
  }

  private cutoffDateFor(value: Date, time: string | null | undefined) {
    const dateKey = jakartaBusinessDayBounds(value).key;
    const cutoff = minutesOf(time || '15:00', 15 * 60);
    return localDateTimeToUtc(dateKey, `${String(Math.floor(cutoff / 60)).padStart(2, '0')}:${String(cutoff % 60).padStart(2, '0')}`);
  }

  private async studentHasAfternoonSchedule(studentId: string, scannedAt: Date, requiredEndTime: string) {
    const { start, end } = dayBounds(scannedAt);
    const cutoffAt = this.cutoffDateFor(scannedAt, requiredEndTime);
    const sessionCount = await this.prisma.session.count({
      where: {
        startsAt: { gte: start, lte: end },
        endsAt: { gte: cutoffAt },
        schoolClass: { enrollments: { some: { studentId } } }
      }
    });
    if (sessionCount > 0) return true;

    const weeklyCount = await this.prisma.weeklySchedule.count({
      where: {
        active: true,
        dayOfWeek: businessWeekday(scannedAt),
        endTime: { gte: requiredEndTime || '15:00' },
        effectiveFrom: { lte: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
        schoolClass: { enrollments: { some: { studentId } } }
      }
    });
    return weeklyCount > 0;
  }

  private async findValidOverride(studentId: string, attendanceDate: Date, scopes: AttendanceOverrideScope[]) {
    return this.prisma.attendanceOverride.findFirst({
      where: {
        studentId,
        date: attendanceDate,
        scope: { in: scopes },
        status: OverrideApprovalStatus.APPROVED,
        expiresAt: { gt: new Date() },
        revokedAt: null
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  private async ensureStudentAsharBeforeCheckout(studentId: string, scannedAt: Date, actor: ScanActor) {
    const policy = await this.getAttendancePolicy();
    if (!policy.requireStudentAsharForAfternoon) return null;

    const attendanceDate = dateOnly(scannedAt);
    const requiredEndTime = policy.asharRequiredClassEndTime || '15:00';
    const hasAfternoonSchedule = await this.studentHasAfternoonSchedule(studentId, scannedAt, requiredEndTime);
    if (!hasAfternoonSchedule) return null;

    const [asharLog, override] = await Promise.all([
      this.prisma.prayerAttendanceLog.findUnique({ where: { studentId_prayerType_attendanceDate: { studentId, prayerType: PrayerType.ASHAR, attendanceDate } } }),
      policy.allowStudentAsharCheckoutOverride ? this.findValidOverride(studentId, attendanceDate, [AttendanceOverrideScope.ALL, AttendanceOverrideScope.ASHAR_CHECKOUT]) : Promise.resolve(null)
    ]);

    if (asharLog) return null;
    if (override) return override.id;

    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'attendance',
        action: 'attendance.student.checkout.blocked_missing_ashar',
        resource: 'user',
        resourceId: studentId,
        after: { studentId, attendanceDate, requiredEndTime, message: 'Siswa masih punya jadwal sampai sore dan belum scan Ashar.' }
      });
    });
    throw new ForbiddenException('Siswa ini masih punya jadwal sampai sore. Scan Ashar dulu sebelum pulang.');
  }

  private async ensureGateScanAllowed(userId: string, direction: GateDirection, scannedAt: Date, actor: ScanActor, role?: Role) {
    const policy = await this.getAttendancePolicy();
    const { start, end } = dayBounds(scannedAt);
    const duplicateWindowMs = Math.max(0, policy.duplicateScanWindowMinutes || 0) * 60 * 1000;
    if (duplicateWindowMs > 0) {
      const duplicateSince = new Date(scannedAt.getTime() - duplicateWindowMs);
      const duplicate = await this.prisma.gateLog.findFirst({
        where: { userId, direction, tappedAt: { gte: duplicateSince, lte: scannedAt } },
        orderBy: { tappedAt: 'desc' }
      });
      if (duplicate) {
        await this.createSecurityFlag(ReconciliationFlagType.SCAN_DUPLIKAT, userId, null, {
          direction,
          duplicateLogId: duplicate.id,
          windowMinutes: policy.duplicateScanWindowMinutes
        }, 'Periksa kemungkinan scan ganda atau replay reader.');
        await this.securityAudit('attendance.gate.scan.rejected_duplicate', userId, { direction, duplicateLogId: duplicate.id, actorId: actor.sub, actorRole: actor.role });
        throw new ConflictException('Scan duplikat dalam jeda waktu yang dibatasi.');
      }
    }

    const lastLog = await this.prisma.gateLog.findFirst({ where: { userId, tappedAt: { gte: start, lte: end } }, orderBy: { tappedAt: 'desc' } });
    const attendanceDate = dateOnly(scannedAt);

    if (direction === GateDirection.IN && lastLog?.direction === GateDirection.IN) {
      const override = role === Role.SISWA ? await this.findValidOverride(userId, attendanceDate, [AttendanceOverrideScope.ALL, AttendanceOverrideScope.GATE_IN]) : null;
      if (!override) {
        await this.createSecurityFlag(ReconciliationFlagType.IN_BERULANG, userId, null, { lastLogId: lastLog.id, lastTappedAt: lastLog.tappedAt }, 'Pastikan tidak ada titip kartu atau scan masuk ganda.');
        await this.securityAudit('attendance.gate.scan.rejected_repeated_in', userId, { lastLogId: lastLog.id });
        throw new ConflictException('Scan masuk sudah tercatat dan belum ada scan keluar.');
      }
      return override.id;
    }

    if (direction === GateDirection.OUT) {
      if (!lastLog || lastLog.direction !== GateDirection.IN) {
        const override = role === Role.SISWA ? await this.findValidOverride(userId, attendanceDate, [AttendanceOverrideScope.ALL, AttendanceOverrideScope.GATE_OUT]) : null;
        if (!override) {
          await this.createSecurityFlag(ReconciliationFlagType.OUT_TANPA_IN, userId, null, { lastLogId: lastLog?.id ?? null, lastDirection: lastLog?.direction ?? null }, 'Validasi manual diperlukan karena scan keluar tanpa scan masuk valid.');
          await this.securityAudit('attendance.gate.scan.rejected_out_without_in', userId, { lastLogId: lastLog?.id ?? null });
          throw new ForbiddenException('Scan keluar ditolak karena belum ada scan masuk valid hari ini.');
        }
        return override.id;
      }

      const minutesSinceIn = Math.round((scannedAt.getTime() - lastLog.tappedAt.getTime()) / 60000);
      if (minutesSinceIn < MIN_GATE_STAY_MINUTES) {
        await this.createSecurityFlag(ReconciliationFlagType.OUT_TERLALU_CEPAT, userId, null, { inLogId: lastLog.id, minutesSinceIn, minimumMinutes: MIN_GATE_STAY_MINUTES }, 'Periksa apakah kartu dititipkan atau siswa/guru langsung keluar setelah masuk.');
      }
    }

    return null;
  }

  private async recordGateScan(userId: string, direction: GateDirection, scannedAt: Date, actor: ScanActor, options: RecordOptions, role?: Role) {
    let usedOverrideId = await this.ensureGateScanAllowed(userId, direction, scannedAt, actor, role);
    if (direction === GateDirection.OUT && role === Role.SISWA) {
      usedOverrideId = usedOverrideId ?? await this.ensureStudentAsharBeforeCheckout(userId, scannedAt, actor);
    }
    if (direction === GateDirection.OUT && role === Role.GURU_MAPEL) {
      const policy = await this.getAttendancePolicy();
      if (!policy.requireTeacherGateOut) usedOverrideId = usedOverrideId ?? null;
    }
    if (direction === GateDirection.OUT && role && isStaffRole(role)) {
      const policy = await this.getAttendancePolicy();
      if (!policy.requireStaffGateOut) usedOverrideId = usedOverrideId ?? null;
    }
    return this.recordGateScanWithoutPolicy(userId, direction, scannedAt, actor, { ...options, usedOverrideId: usedOverrideId ?? options.usedOverrideId ?? null });
  }

  private async recordGateScanWithoutPolicy(userId: string, direction: GateDirection, scannedAt: Date, actor: ScanActor, options: RecordOptions) {
    const businessDate = gateBusinessDate(scannedAt);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const log = await tx.gateLog.create({
          data: {
            userId,
            direction,
            businessDate,
            tappedAt: scannedAt,
            deviceId: options.deviceId ?? null,
            readerId: options.readerId ?? null,
            cardId: options.cardId ?? null,
            qrCredentialId: options.qrCredentialId ?? null,
            scanMode: options.scanMode ?? null,
            appVersion: options.appVersion ?? null,
            signatureVerified: Boolean(options.signatureVerified),
            deviceEventId: options.deviceEventId ?? null,
            deviceTimestamp: options.deviceTimestamp ?? null,
            nonceHash: options.nonceHash ?? null,
            bodyHash: options.bodyHash ?? null,
            manualReason: options.manualReason ?? null,
            createdById: actor.sub,
            usedOverrideId: options.usedOverrideId ?? null
          }
        });
        if (options.cardId) await tx.smartCard.update({ where: { id: options.cardId }, data: { lastTappedAt: scannedAt } });
        if (options.qrCredentialId) await tx.qrCredential.update({ where: { id: options.qrCredentialId }, data: { lastUsedAt: scannedAt } });
        if (options.readerId || options.deviceId) {
          await tx.deviceReader.updateMany({
            where: options.readerId ? { id: options.readerId } : { deviceId: options.deviceId ?? '' },
            data: { lastSeenAt: scannedAt, appVersion: options.appVersion ?? undefined, appVersionCode: options.appVersionCode ?? undefined, currentMode: options.scanMode ?? undefined, ...(options.signatureVerified ? { lastSignedScanAt: scannedAt } : {}) }
          });
        }
        await writeAudit(tx, {
          actorId: actor.sub,
          actorRole: actor.role,
          module: 'attendance',
          action: options.qrCredentialId ? 'attendance.qr.reader.scan.accepted' : options.manualReason ? 'attendance.manual.scan.recorded' : 'attendance.reader.gate.scan.accepted',
          resource: 'gateLog',
          resourceId: log.id,
          reason: options.manualReason,
          after: { ...log, kind: 'GATE', usedOverrideId: options.usedOverrideId ?? null }
        });
        await writeLiveMonitorOutboxEvent(tx, {
          eventType: 'gate.scan_recorded',
          aggregateType: 'gateLog',
          aggregateId: log.id,
          logicalKey: `gate:${log.id}`,
          payload: { gateLogId: log.id, userId, direction, businessDate: businessDate.toISOString(), tappedAt: scannedAt.toISOString(), source: options.qrCredentialId ? 'qr_reader' : options.manualReason ? 'manual' : 'reader' }
        });
        return { kind: 'GATE', message: direction === GateDirection.IN ? 'Scan gerbang masuk tercatat.' : 'Scan gerbang keluar tercatat.', item: log };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
        if (options.deviceEventId && target.includes('deviceEventId')) {
          const canonical = await this.prisma.gateLog.findUnique({ where: { deviceEventId: options.deviceEventId } });
          if (canonical) {
            return { kind: 'GATE', message: direction === GateDirection.IN ? 'Scan gerbang masuk sudah tercatat.' : 'Scan gerbang keluar sudah tercatat.', item: canonical, idempotent: true };
          }
        }
        if (target.includes('userId') && target.includes('businessDate') && target.includes('direction')) {
          const canonical = await this.prisma.gateLog.findFirst({ where: { userId, businessDate, direction }, orderBy: { tappedAt: 'asc' } });
          throw new ConflictException({
            code: API_ERROR_CODES.GATE_DIRECTION_ALREADY_RECORDED,
            message: direction === GateDirection.IN ? 'Scan masuk hari ini sudah tercatat.' : 'Scan keluar hari ini sudah tercatat.',
            canonicalGateLogId: canonical?.id ?? null
          });
        }
      }
      throw error;
    }
  }

  private async rejectPrayerOutsideWindow(studentId: string, scannedAt: Date, source: ReaderType, actor: ScanActor, options: RecordOptions, classification: PrayerClassification): Promise<never> {
    const nextWindow = classification.nextWindow
      ? {
          prayerType: classification.nextWindow.prayerType,
          startTime: formatMinute(classification.nextWindow.startMinute),
          endTime: formatMinute(classification.nextWindow.endMinute)
        }
      : null;
    await this.prisma.rejectedDeviceScan.create({
      data: {
        readerId: options.readerId ?? null,
        deviceId: options.deviceId ?? null,
        scanMode: options.scanMode ?? null,
        nonceHash: options.nonceHash ?? null,
        bodyHash: options.bodyHash ?? null,
        reason: API_ERROR_CODES.PRAYER_OUTSIDE_WINDOW
      }
    }).catch(() => null);
    await this.securityAudit('attendance.prayer.scan.rejected_outside_window', studentId, {
      source,
      actorId: actor.sub,
      scannedAt: scannedAt.toISOString(),
      nextWindow
    });
    throw new ForbiddenException({
      code: API_ERROR_CODES.PRAYER_OUTSIDE_WINDOW,
      message: 'Scan ibadah di luar jadwal yang diizinkan.',
      currentWindow: null,
      nextWindow
    });
  }

  private async recordPrayerScan(studentId: string, prayerType: PrayerType, scannedAt: Date, source: ReaderType, actor: ScanActor, options: RecordOptions) {
    const attendanceDate = dateOnly(scannedAt);
    const existing = await this.prisma.prayerAttendanceLog.findUnique({ where: { studentId_prayerType_attendanceDate: { studentId, prayerType, attendanceDate } } });
    if (existing) {
      await this.touchSuccessfulReaderScan(scannedAt, options);
      await this.securityAudit('attendance.prayer.scan.idempotent_duplicate', studentId, { prayerType, existingLogId: existing.id });
      return { kind: 'PRAYER', message: `${prayerLabel(prayerType)} hari ini sudah tercatat.`, item: existing, idempotent: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const log = await tx.prayerAttendanceLog.create({
        data: {
          studentId,
          prayerType,
          attendanceDate,
          scannedAt,
          deviceId: options.deviceId ?? null,
          readerId: options.readerId ?? null,
          cardId: options.cardId ?? null,
          qrCredentialId: options.qrCredentialId ?? null,
          scanMode: options.scanMode ?? null,
          appVersion: options.appVersion ?? null,
          source,
          reason: options.manualReason ?? null,
          createdById: options.manualReason ? actor.sub : null,
          signatureVerified: Boolean(options.signatureVerified),
          nonceHash: options.nonceHash ?? null,
          bodyHash: options.bodyHash ?? null,
          usedOverrideId: options.usedOverrideId ?? null
        }
      });
      if (options.cardId) await tx.smartCard.update({ where: { id: options.cardId }, data: { lastTappedAt: scannedAt } });
      if (options.qrCredentialId) await tx.qrCredential.update({ where: { id: options.qrCredentialId }, data: { lastUsedAt: scannedAt } });
      if (options.readerId || options.deviceId) {
        await tx.deviceReader.updateMany({
          where: options.readerId ? { id: options.readerId } : { deviceId: options.deviceId ?? '' },
          data: { lastSeenAt: scannedAt, appVersion: options.appVersion ?? undefined, appVersionCode: options.appVersionCode ?? undefined, currentMode: options.scanMode ?? undefined, ...(options.signatureVerified ? { lastSignedScanAt: scannedAt } : {}) }
        });
      }
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'attendance',
        action: options.qrCredentialId ? 'attendance.qr.reader.scan.accepted' : options.manualReason ? 'attendance.manual.scan.recorded' : 'attendance.reader.prayer.scan.accepted',
        resource: 'prayerAttendanceLog',
        resourceId: log.id,
        reason: options.manualReason,
        after: log as unknown as Prisma.InputJsonValue
      });
      await writeLiveMonitorOutboxEvent(tx, {
        eventType: 'prayer.scan_recorded',
        aggregateType: 'prayerAttendanceLog',
        aggregateId: log.id,
        logicalKey: `prayer:${log.id}`,
        payload: { prayerAttendanceLogId: log.id, studentId, prayerType, attendanceDate: attendanceDate.toISOString(), scannedAt: scannedAt.toISOString(), source }
      });
      const label = prayerLabel(prayerType);
      return { kind: 'PRAYER', message: `Sholat ${label} tercatat.`, item: log };
    });
  }

  async createOverride(payload: CreateAttendanceOverrideDto, actor: ScanActor, meta: RequestMeta = {}) {
    const policy = await this.getAttendancePolicy();
    if (!policy.allowManualOverride) throw new ForbiddenException('Override manual sedang dinonaktifkan.');
    const date = dateOnly(payload.date || new Date());
    const scope = parseScope(payload.scope);
    const reason = assertReasonQuality(payload.reason, 'Alasan override');
    const student = await this.prisma.user.findUnique({ where: { id: payload.studentId } });
    if (!student || student.role !== Role.SISWA || !student.active) throw new NotFoundException('Siswa tidak ditemukan atau tidak aktif.');
    if (this.accessPolicy && !this.accessPolicy.canCreateOverride(actor, student.id, scope)) throw new ForbiddenException('Anda tidak boleh membuat override ini.');

    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : endOfDay(date);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) throw new BadRequestException('Masa berlaku override tidak valid atau sudah lewat.');

    let status: OverrideApprovalStatus = OverrideApprovalStatus.APPROVED;
    let approvedById: string | null = actor.sub;
    let approvedAt: Date | null = new Date();
    if (scope === AttendanceOverrideScope.ALL) {
      if (!payload.stepUpPassword) {
        status = OverrideApprovalStatus.PENDING_REVIEW;
        approvedById = null;
        approvedAt = null;
      } else {
        await this.stepUp?.assertRecentPassword(actor.sub, payload.stepUpPassword);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.attendanceOverride.findUnique({ where: { studentId_date_scope: { studentId: student.id, date, scope } } });
      const override = await tx.attendanceOverride.upsert({
        where: { studentId_date_scope: { studentId: student.id, date, scope } },
        update: { reason, createdById: actor.sub, expiresAt, status, approvedById, approvedAt, revokedAt: null, revokedById: null },
        create: { studentId: student.id, date, scope, reason, createdById: actor.sub, expiresAt, status, approvedById, approvedAt }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'attendance',
        action: status === OverrideApprovalStatus.APPROVED ? 'attendance.override.approved' : 'attendance.override.pending_review',
        resource: 'attendanceOverride',
        resourceId: override.id,
        reason,
        requestIp: meta.requestIp ?? null,
        requestDevice: meta.requestDevice ?? null,
        before: before as unknown as Prisma.InputJsonValue,
        after: override as unknown as Prisma.InputJsonValue
      });
      await this.createSecurityFlag(ReconciliationFlagType.HADIR_VIA_OVERRIDE, student.id, null, { scope, overrideId: override.id, status, expiresAt }, 'Review penggunaan override agar tidak memengaruhi laporan tanpa verifikasi.');
      return { kind: 'OVERRIDE', message: status === OverrideApprovalStatus.APPROVED ? 'Verifikasi manual siswa tersimpan.' : 'Override masuk antrean review admin.', item: override };
    });
  }

  async approveOverride(id: string, payload: ReviewAttendanceOverrideDto, actor: ScanActor, meta: RequestMeta = {}) {
    if (!canReviewOverride(actor.role)) throw new ForbiddenException('Approval override hanya untuk Admin TU/Developer.');
    const reason = assertReasonQuality(payload.reason, 'Alasan approval override');
    if (payload.stepUpPassword) await this.stepUp?.assertRecentPassword(actor.sub, payload.stepUpPassword);
    const before = await this.prisma.attendanceOverride.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Override tidak ditemukan.');
    if (before.revokedAt || before.status === OverrideApprovalStatus.REVOKED) throw new BadRequestException('Override sudah dicabut.');
    if (before.expiresAt <= new Date()) throw new BadRequestException('Override sudah kedaluwarsa.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceOverride.update({
        where: { id },
        data: { status: OverrideApprovalStatus.APPROVED, approvedById: actor.sub, approvedAt: new Date(), revokedAt: null, revokedById: null }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'attendance',
        action: 'attendance.override.approved_review',
        resource: 'attendanceOverride',
        resourceId: id,
        reason,
        requestIp: meta.requestIp ?? null,
        requestDevice: meta.requestDevice ?? null,
        before,
        after: updated
      });
      return { kind: 'OVERRIDE', message: 'Override disetujui.', item: updated };
    });
  }

  async revokeOverride(id: string, payload: ReviewAttendanceOverrideDto, actor: ScanActor, meta: RequestMeta = {}) {
    if (!canReviewOverride(actor.role)) throw new ForbiddenException('Cabut override hanya untuk Admin TU/Developer.');
    const reason = assertReasonQuality(payload.reason, 'Alasan pencabutan override');
    const before = await this.prisma.attendanceOverride.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Override tidak ditemukan.');
    if (before.revokedAt || before.status === OverrideApprovalStatus.REVOKED) throw new BadRequestException('Override sudah dicabut.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceOverride.update({
        where: { id },
        data: { status: OverrideApprovalStatus.REVOKED, revokedById: actor.sub, revokedAt: new Date() }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'attendance',
        action: 'attendance.override.revoked',
        resource: 'attendanceOverride',
        resourceId: id,
        reason,
        requestIp: meta.requestIp ?? null,
        requestDevice: meta.requestDevice ?? null,
        before,
        after: updated
      });
      return { kind: 'OVERRIDE', message: 'Override dicabut.', item: updated };
    });
  }

  private async createSecurityFlag(type: ReconciliationFlagType, userId: string, sessionId: string | null, evidence: Prisma.InputJsonValue, recommendation: string) {
    const fingerprint = [type, sessionId ?? 'no-session', userId, JSON.stringify(evidence)].join(':').slice(0, 512);
    await this.prisma.reconciliationFlag.upsert({
      where: { fingerprint },
      update: { status: 'OPEN', evidence, details: evidence, recommendation, priority: ReconciliationPriority.HIGH },
      create: { type, sessionId, userId, evidence, details: evidence, recommendation, priority: ReconciliationPriority.HIGH, fingerprint }
    });
  }

  private async securityAudit(action: string, resourceId: string, after: Prisma.InputJsonValue) {
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, { module: 'attendance_security', action, resource: 'attendanceSecurityEvent', resourceId, after });
    });
  }
}
