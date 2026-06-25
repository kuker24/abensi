import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AndroidReaderMode, DevicePlatform, DeviceReaderStatus, Prisma, ReaderType, Role } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { canonicalJson } from '../security/canonical-json';
import { DeviceSignatureService, credentialHashMatches, normalizedReaderIdentifier, readerCandidateWhere, readerCredentialDigest, readerCredentialDigestCandidates, readerLookupLimit, uniqueReaderMatch, type ReaderSignatureHeaders } from '../security/device-signature.service';
import { StepUpAuthService } from '../security/step-up-auth.service';
import { AndroidProvisionCompleteDto, AndroidProvisionStartDto, AndroidReaderStatusDto, CreateReaderDto, RevokeReaderDto, RotateReaderKeyDto, UpdateReaderDto, UpdateReaderStatusDto } from './device-reader.dto';

function mintReaderCredential() {
  return `shr_${randomBytes(16).toString('hex')}`;
}

function generateReaderCredentialMetadata() {
  const value = mintReaderCredential();
  return {
    apiKeyHash: readerCredentialDigest(value),
    keyPrefix: value.slice(0, 7),
    keyLast4: value.slice(-4),
    keyRotatedAt: new Date()
  };
}

function generateProvisionToken() {
  return `shrp_${randomBytes(24).toString('base64url')}`;
}

export const MAX_ACTIVE_ANDROID_READERS = 2;
export const ANDROID_READER_LIMIT_MESSAGE = 'Batas HP scanner aktif sudah penuh. Cabut salah satu HP dulu untuk mengganti perangkat.';

const MAX_PROVISION_TOKEN_LENGTH = 128;
const ANDROID_READER_ONLINE_WINDOW_MS = Number(process.env.ANDROID_READER_ONLINE_WINDOW_MS ?? '120000');
const PROVISION_TOKEN_PATTERN = /^shrp_[A-Za-z0-9_-]{16,}$/;

function normalizeProvisionToken(token: string | null | undefined) {
  const normalized = String(token || '').trim();
  if (!normalized || normalized.length > MAX_PROVISION_TOKEN_LENGTH || !PROVISION_TOKEN_PATTERN.test(normalized)) return '';
  return normalized;
}

function provisioningTokenWhere(token: string): Prisma.DeviceReaderWhereInput {
  const normalized = normalizeProvisionToken(token);
  if (!normalized) return { id: '__never_match_reader__' };
  return { OR: readerCredentialDigestCandidates(normalized).map((provisioningTokenHash) => ({ provisioningTokenHash })) };
}

function uniqueProvisioningMatch<T extends { id: string; provisioningTokenHash?: string | null }>(candidates: T[], token: string) {
  if (candidates.length >= readerLookupLimit()) return { status: 'too_many_candidates' as const };
  const matches = new Map<string, T>();
  for (const candidate of candidates) {
    if (credentialHashMatches(token, candidate.provisioningTokenHash)) matches.set(candidate.id, candidate);
  }
  if (matches.size === 0) return { status: 'not_found' as const };
  if (matches.size > 1) return { status: 'ambiguous' as const };
  return { status: 'matched' as const, reader: [...matches.values()][0] };
}

function defaultModes(type?: ReaderType) {
  if (type === ReaderType.GATE) return [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT];
  if (type === ReaderType.MUSHOLA) return [AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY];
  if (type === ReaderType.QR_ANDROID) return [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY];
  return [];
}

function effectiveAllowedModes(type: ReaderType, requested?: AndroidReaderMode[] | null) {
  // QR_ANDROID is a physical phone identity only; it must not be permanently bound
  // to Gerbang or Mushola. The APK chooses GERBANG/MUSHOLA at scan time.
  if (type === ReaderType.QR_ANDROID) return defaultModes(ReaderType.QR_ANDROID);
  return requested ?? defaultModes(type);
}

function clampProvisionMinutes(value?: number) {
  return Math.max(1, Math.min(60, value ?? 15));
}

function clampText(value: string | null | undefined, max: number) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function sanitizeWarnings(warnings?: string[] | null) {
  const seen = new Set<string>();
  const safe: string[] = [];
  for (const warning of warnings || []) {
    const normalized = clampText(warning, 80);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    safe.push(normalized);
    if (safe.length >= 10) break;
  }
  return safe;
}

interface Actor {
  sub: string;
  role: Role;
}

@Injectable()
export class DeviceReaderService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly signatures?: DeviceSignatureService,
    @Optional() private readonly stepUp?: StepUpAuthService
  ) {}

  private redact<T extends { apiKeyHash?: string | null; keyPrefix?: string | null; keyLast4?: string | null; readerSecretCiphertext?: string | null; provisioningTokenHash?: string | null }>(reader: T) {
    const { apiKeyHash: _apiKeyHash, readerSecretCiphertext: _secret, provisioningTokenHash: _token, ...safe } = reader;
    return {
      ...safe,
      hasReaderSecret: Boolean(reader.readerSecretCiphertext),
      hasProvisioningToken: Boolean(reader.provisioningTokenHash),
      apiKeyMasked: reader.keyPrefix && reader.keyLast4 ? `${reader.keyPrefix}…${reader.keyLast4}` : null
    };
  }

  private androidMonitoring(reader: { type?: ReaderType | null; status?: DeviceReaderStatus | null; deviceId?: string | null; lastHeartbeatAt?: Date | string | null; pendingQueueCount?: number | null; batteryLevel?: number | null; networkStatus?: string | null; statusWarnings?: string[] | null }) {
    if (reader.type !== ReaderType.QR_ANDROID) return {};
    const heartbeatAt = reader.lastHeartbeatAt ? new Date(reader.lastHeartbeatAt).getTime() : 0;
    const heartbeatFresh = heartbeatAt > 0 && Date.now() - heartbeatAt <= ANDROID_READER_ONLINE_WINDOW_MS;
    const isOnline = reader.status === DeviceReaderStatus.ACTIVE && Boolean(reader.deviceId) && heartbeatFresh;
    const monitoringStatus = reader.status === DeviceReaderStatus.REVOKED
      ? 'REVOKED'
      : !reader.deviceId
        ? 'PENDING'
        : reader.status !== DeviceReaderStatus.ACTIVE
          ? 'INACTIVE'
          : isOnline ? 'ONLINE' : 'OFFLINE';
    const warnings = new Set(sanitizeWarnings(reader.statusWarnings));
    if (monitoringStatus === 'OFFLINE') warnings.add('HEARTBEAT_OFFLINE');
    if ((reader.pendingQueueCount ?? 0) > 0) warnings.add('OFFLINE_QUEUE_PENDING');
    if (typeof reader.batteryLevel === 'number' && reader.batteryLevel <= 20) warnings.add('LOW_BATTERY');
    const network = String(reader.networkStatus || '').toUpperCase();
    if (network === 'OFFLINE' || network === 'NO_NETWORK') warnings.add('NETWORK_OFFLINE');
    return { isOnline, monitoringStatus, monitorWarnings: [...warnings] };
  }

  private readerResponse<T extends { type?: ReaderType | null; status?: DeviceReaderStatus | null; deviceId?: string | null; lastHeartbeatAt?: Date | string | null; pendingQueueCount?: number | null; batteryLevel?: number | null; networkStatus?: string | null; statusWarnings?: string[] | null; apiKeyHash?: string | null; keyPrefix?: string | null; keyLast4?: string | null; readerSecretCiphertext?: string | null; provisioningTokenHash?: string | null }>(reader: T, lastUsedMode?: AndroidReaderMode | null) {
    return { ...this.redact(reader), lastUsedMode: lastUsedMode ?? null, ...this.androidMonitoring(reader) };
  }

  async listReaders(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.deviceReader.count(),
      this.prisma.deviceReader.findMany({ orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.limit })
    ]);
    const androidReaderIds = items.filter((item) => item.type === ReaderType.QR_ANDROID).map((item) => item.id);
    const lastModeByReader = new Map<string, AndroidReaderMode>();
    if (androidReaderIds.length) {
      const latestByReader = await Promise.all(androidReaderIds.map(async (readerId) => {
        const [gate, prayer] = await Promise.all([
          this.prisma.gateLog.findFirst({ where: { readerId }, orderBy: { tappedAt: 'desc' }, select: { scanMode: true, tappedAt: true } }),
          this.prisma.prayerAttendanceLog.findFirst({ where: { readerId }, orderBy: { scannedAt: 'desc' }, select: { scanMode: true, scannedAt: true } })
        ]);
        const gateAt = gate?.tappedAt?.getTime() ?? 0;
        const prayerAt = prayer?.scannedAt?.getTime() ?? 0;
        const scanMode = gateAt >= prayerAt ? gate?.scanMode : prayer?.scanMode;
        return { readerId, scanMode: scanMode ?? null };
      }));
      for (const item of latestByReader) if (item.scanMode) lastModeByReader.set(item.readerId, item.scanMode);
    }
    return { items: items.map((item) => this.readerResponse(item, lastModeByReader.get(item.id) ?? null)), meta: buildPaginationMeta(total, pagination) };
  }

  async getStatus(id: string) {
    const normalized = normalizedReaderIdentifier(id);
    if (!normalized) throw new NotFoundException('Reader tidak ditemukan.');
    const readers = await this.prisma.deviceReader.findMany({ where: readerCandidateWhere(normalized), take: readerLookupLimit() });
    const match = uniqueReaderMatch(readers, normalized);
    if (match.status !== 'matched') throw new NotFoundException('Reader tidak ditemukan.');
    return this.readerResponse(match.reader);
  }

  async recordAndroidStatus(payload: AndroidReaderStatusDto, signed: ReaderSignatureHeaders & { method: string; path: string }) {
    if (!this.signatures) throw new ForbiddenException('Verifikasi signature reader belum tersedia.');
    const bodyForHash = canonicalJson(payload);
    const verification = await this.signatures.assertValidSignedReaderRequest({
      method: signed.method,
      path: signed.path,
      rawBody: bodyForHash,
      expectedType: ReaderType.QR_ANDROID,
      appVersionCode: payload.appVersionCode,
      headers: signed
    });
    const lastQueueFlushAt = payload.lastQueueFlushAt ? new Date(payload.lastQueueFlushAt) : undefined;
    if (lastQueueFlushAt && Number.isNaN(lastQueueFlushAt.getTime())) throw new BadRequestException('Waktu flush antrean tidak valid.');
    const updated = await this.prisma.deviceReader.update({
      where: { id: verification.reader.id },
      data: {
        lastSeenAt: new Date(),
        lastHeartbeatAt: new Date(),
        pendingQueueCount: payload.pendingQueueCount,
        lastQueueFlushAt,
        currentMode: payload.currentMode,
        batteryLevel: payload.batteryLevel,
        networkStatus: clampText(payload.networkStatus, 40),
        lastStatusMessage: clampText(payload.statusMessage, 180),
        statusWarnings: sanitizeWarnings(payload.warnings),
        appVersion: payload.appVersion,
        appVersionCode: payload.appVersionCode
      }
    });
    return { ok: true, item: this.readerResponse(updated), serverTime: new Date().toISOString() };
  }

  private async assertAndroidReaderActiveSlotAvailable(tx: Pick<PrismaService, 'deviceReader'> | Prisma.TransactionClient, excludingReaderId?: string | null) {
    const activeCount = await tx.deviceReader.count({
      where: {
        type: ReaderType.QR_ANDROID,
        status: DeviceReaderStatus.ACTIVE,
        ...(excludingReaderId ? { id: { not: excludingReaderId } } : {})
      }
    });
    if (activeCount >= MAX_ACTIVE_ANDROID_READERS) throw new ConflictException(ANDROID_READER_LIMIT_MESSAGE);
  }

  async createReader(payload: CreateReaderDto, actor: Actor) {
    const secret = this.signatures?.generateReaderSecret() ?? `shrsec_${randomBytes(32).toString('base64url')}`;
    const encrypted = this.signatures?.encryptSecret(secret) ?? secret;
    const type = payload.type ?? ReaderType.GATE;
    const platform = type === ReaderType.QR_ANDROID ? DevicePlatform.ANDROID : payload.platform ?? DevicePlatform.HARDWARE;
    const allowedModes = effectiveAllowedModes(type, payload.allowedModes);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (type === ReaderType.QR_ANDROID) await this.assertAndroidReaderActiveSlotAvailable(tx);
        const created = await tx.deviceReader.create({
          data: {
            name: payload.name,
            ...generateReaderCredentialMetadata(),
            deviceId: payload.deviceId || null,
            readerSecretCiphertext: encrypted,
            readerSecretRotatedAt: new Date(),
            type,
            platform,
            appVersion: payload.appVersion,
            appVersionCode: payload.appVersionCode,
            allowedModes,
            locationLabel: payload.locationLabel ?? payload.locationName,
            locationName: payload.locationName ?? payload.locationLabel,
            locationLat: payload.locationLat,
            locationLng: payload.locationLng,
            createdById: actor.sub
          }
        });

        await writeAudit(tx, {
          actorId: actor.sub,
          actorRole: actor.role,
          module: 'device',
          action: type === ReaderType.QR_ANDROID ? 'reader.android.provisioned' : 'device.reader.created',
          resource: 'deviceReader',
          resourceId: created.id,
          after: { ...this.redact(created), provisionedSecretReturnedOnce: true } as Prisma.InputJsonValue
        });

        return { ...this.redact(created), readerSecret: secret, message: 'Simpan secret ini sekarang. Secret tidak akan ditampilkan lagi.' };
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Device ID/API key reader sudah terdaftar.');
      throw error;
    }
  }

  async startAndroidProvision(payload: AndroidProvisionStartDto, actor: Actor) {
    const token = generateProvisionToken();
    const expiresAt = new Date(Date.now() + clampProvisionMinutes(payload.expiresInMinutes) * 60_000);
    const allowedModes = effectiveAllowedModes(ReaderType.QR_ANDROID);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertAndroidReaderActiveSlotAvailable(tx);
      const item = await tx.deviceReader.create({
        data: {
          name: payload.name,
          ...generateReaderCredentialMetadata(),
          status: DeviceReaderStatus.INACTIVE,
          type: ReaderType.QR_ANDROID,
          platform: DevicePlatform.ANDROID,
          allowedModes,
          locationLabel: payload.locationName,
          locationName: payload.locationName,
          provisioningTokenHash: readerCredentialDigest(token),
          provisioningExpiresAt: expiresAt,
          createdById: actor.sub
        }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'device',
        action: 'reader.android.provision.started',
        resource: 'deviceReader',
        resourceId: item.id,
        after: { ...this.redact(item), provisioningExpiresAt: expiresAt } as Prisma.InputJsonValue
      });
      return item;
    });
    return {
      item: this.redact(created),
      provisionToken: token,
      provisioningQr: `schoolhub:reader-provision:v1:${token}`,
      expiresAt,
      message: 'Scan QR provisioning ini dari APK Android. Token tidak boleh dibagikan.'
    };
  }

  async completeAndroidProvision(payload: AndroidProvisionCompleteDto) {
    const provisionToken = normalizeProvisionToken(payload.provisionToken);
    if (!provisionToken) throw new NotFoundException('Token provisioning tidak ditemukan.');
    const deviceId = normalizedReaderIdentifier(payload.deviceId);
    if (!deviceId) throw new BadRequestException('Device ID tidak valid.');
    const candidates = await this.prisma.deviceReader.findMany({ where: provisioningTokenWhere(provisionToken), take: readerLookupLimit() });
    const match = uniqueProvisioningMatch(candidates, provisionToken);
    if (match.status === 'not_found') throw new NotFoundException('Token provisioning tidak ditemukan.');
    if (match.status !== 'matched') throw new ForbiddenException('Token provisioning tidak valid.');
    const reader = match.reader;
    const now = new Date();
    if (reader.provisioningExpiresAt && reader.provisioningExpiresAt <= now) throw new ForbiddenException('Token provisioning sudah kedaluwarsa.');
    if (reader.status === DeviceReaderStatus.REVOKED) throw new ForbiddenException('Reader sudah dicabut.');
    const secret = this.signatures?.generateReaderSecret() ?? `shrsec_${randomBytes(32).toString('base64url')}`;
    const encrypted = this.signatures?.encryptSecret(secret) ?? secret;
    const tokenHashes = readerCredentialDigestCandidates(provisionToken);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await this.assertAndroidReaderActiveSlotAvailable(tx, reader.id);
        const claimed = await tx.deviceReader.updateMany({
          where: {
            id: reader.id,
            status: { not: DeviceReaderStatus.REVOKED },
            provisioningTokenHash: { in: tokenHashes },
            OR: [{ provisioningExpiresAt: null }, { provisioningExpiresAt: { gt: now } }]
          },
          data: {
            deviceId,
            name: payload.deviceName || reader.name,
            status: DeviceReaderStatus.ACTIVE,
            readerSecretCiphertext: encrypted,
            readerSecretKeyVersion: { increment: 1 },
            readerSecretRotatedAt: now,
            appVersion: payload.appVersion,
            appVersionCode: payload.appVersionCode,
            platform: DevicePlatform.ANDROID,
            allowedModes: defaultModes(ReaderType.QR_ANDROID),
            provisionedAt: now,
            provisioningTokenHash: null,
            provisioningExpiresAt: null,
            lastSeenAt: now,
            lastHeartbeatAt: now,
            pendingQueueCount: 0,
            currentMode: null,
            batteryLevel: null,
            networkStatus: null,
            lastStatusMessage: 'Perangkat berhasil diaktivasi.',
            statusWarnings: []
          }
        });
        if (claimed.count !== 1) throw new ConflictException('Token provisioning sudah dipakai atau tidak valid.');
        const item = await tx.deviceReader.findUniqueOrThrow({ where: { id: reader.id } });
        await writeAudit(tx, {
          module: 'device',
          action: 'reader.android.provisioned',
          resource: 'deviceReader',
          resourceId: item.id,
          after: { ...this.redact(item), provisionedSecretReturnedOnce: true } as Prisma.InputJsonValue
        });
        return item;
      });
      return { deviceId: updated.deviceId, readerId: updated.id, readerSecret: secret, allowedModes: updated.allowedModes, message: 'Perangkat Android berhasil diprovision. Secret simpan di Android Keystore.' };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Device ID Android sudah terdaftar.');
      throw error;
    }
  }

  async rotateApiKey(id: string, actor: Actor, payload: RotateReaderKeyDto = {}) {
    if (process.env.STEP_UP_FOR_READER_ROTATE === 'true') await this.stepUp?.assertRecentPassword(actor.sub, payload.stepUpPassword);
    const before = await this.prisma.deviceReader.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Reader tidak ditemukan.');
    if (before.status === DeviceReaderStatus.REVOKED) throw new ForbiddenException('Reader sudah dicabut.');
    const secret = this.signatures?.generateReaderSecret() ?? `shrsec_${randomBytes(32).toString('base64url')}`;
    const encrypted = this.signatures?.encryptSecret(secret) ?? secret;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deviceReader.update({
        where: { id },
        data: { ...generateReaderCredentialMetadata(), readerSecretCiphertext: encrypted, readerSecretKeyVersion: { increment: 1 }, readerSecretRotatedAt: new Date(), updatedById: actor.sub }
      });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'device',
        action: updated.type === ReaderType.QR_ANDROID ? 'reader.android.secret.rotated' : 'device.reader.key.rotated',
        resource: 'deviceReader',
        resourceId: id,
        before: this.redact(before) as Prisma.InputJsonValue,
        after: { ...this.redact(updated), provisionedSecretReturnedOnce: true } as Prisma.InputJsonValue
      });

      return { ...this.redact(updated), readerSecret: secret, message: 'Simpan secret baru ini sekarang. Secret tidak akan ditampilkan lagi.' };
    });
  }

  async updateStatus(id: string, payload: UpdateReaderStatusDto, actor: Actor) {
    const before = await this.prisma.deviceReader.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Reader tidak ditemukan.');
    if (before.status === payload.status) throw new BadRequestException('Status reader sudah sama.');

    return this.prisma.$transaction(async (tx) => {
      if (before.type === ReaderType.QR_ANDROID && payload.status === DeviceReaderStatus.ACTIVE) {
        await this.assertAndroidReaderActiveSlotAvailable(tx, id);
      }
      const updated = await tx.deviceReader.update({
        where: { id },
        data: {
          status: payload.status,
          ...(before.type === ReaderType.QR_ANDROID && payload.status === DeviceReaderStatus.ACTIVE ? { platform: DevicePlatform.ANDROID, allowedModes: defaultModes(ReaderType.QR_ANDROID) } : {})
        }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'device',
        action: 'device.reader.status.updated',
        resource: 'deviceReader',
        resourceId: id,
        before: this.redact(before) as Prisma.InputJsonValue,
        after: this.redact(updated) as Prisma.InputJsonValue
      });
      return this.redact(updated);
    });
  }

  async updateReader(id: string, payload: UpdateReaderDto, actor: Actor) {
    const before = await this.prisma.deviceReader.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Reader tidak ditemukan.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.deviceReader.update({
        where: { id },
        data: {
          name: payload.name,
          locationLabel: payload.locationLabel ?? payload.locationName,
          locationName: payload.locationName ?? payload.locationLabel,
          locationLat: payload.locationLat,
          locationLng: payload.locationLng,
          allowedModes: before.type === ReaderType.QR_ANDROID ? defaultModes(ReaderType.QR_ANDROID) : payload.allowedModes,
          appVersion: payload.appVersion,
          appVersionCode: payload.appVersionCode,
          updatedById: actor.sub
        }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'device',
        action: 'device.reader.updated',
        resource: 'deviceReader',
        resourceId: id,
        before: this.redact(before) as Prisma.InputJsonValue,
        after: this.redact(item) as Prisma.InputJsonValue
      });
      return item;
    });
    return this.redact(updated);
  }

  async revoke(id: string, payload: RevokeReaderDto, actor: Actor) {
    const before = await this.prisma.deviceReader.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Reader tidak ditemukan.');
    if (before.status === DeviceReaderStatus.REVOKED) throw new BadRequestException('Reader sudah dicabut.');
    const revokedAt = new Date();
    const revokeData: Prisma.DeviceReaderUncheckedUpdateInput = {
      status: DeviceReaderStatus.REVOKED,
      revokedAt,
      revokedById: actor.sub,
      revokedReason: payload.reason
    };
    if (before.type === ReaderType.QR_ANDROID) {
      Object.assign(revokeData, {
        deviceId: null,
        readerSecretCiphertext: null,
        provisioningTokenHash: null,
        provisioningExpiresAt: null,
        lastSignedScanAt: null,
        pendingQueueCount: 0,
        currentMode: null,
        batteryLevel: null,
        networkStatus: null,
        lastStatusMessage: null,
        statusWarnings: []
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.deviceReader.update({ where: { id }, data: revokeData });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'device',
        action: before.type === ReaderType.QR_ANDROID ? 'reader.android.revoked' : 'device.reader.revoked',
        resource: 'deviceReader',
        resourceId: id,
        reason: payload.reason,
        before: this.redact(before) as Prisma.InputJsonValue,
        after: this.redact(item) as Prisma.InputJsonValue
      });
      return item;
    });
    return this.redact(updated);
  }
}
