import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  Prisma,
  Role,
  SessionStatus,
  StudentAttendanceStatus,
  TeacherSessionStatus,
  PrayerType,
  AttendanceOverrideScope,
  OverrideApprovalStatus
} from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/current-user.decorator';
import { BatchAttendanceDto, CloseSessionDto, CorrectAttendanceDto, SessionGeoDto } from './attendance-class.dto';
import { AccessPolicyService } from '../security/access-policy.service';
import { writeAudit } from '../../common/audit-log';
import { assertReasonQuality } from '../security/reason-policy';
import { jakartaBusinessDayBounds, localMinutesOfDay } from '../../common/business-time';

function teacherStatusForCheckIn(startsAt: Date, policyGraceMinutes?: number) {
  const graceMinutes = policyGraceMinutes ?? 15;
  const lateAfter = startsAt.getTime() + graceMinutes * 60 * 1000;
  return Date.now() > lateAfter ? TeacherSessionStatus.TELAT : TeacherSessionStatus.HADIR;
}

function durationMinutes(start?: Date | null, end?: Date | null) {
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

type GeofencePolicyForValidation = {
  centerLat: number;
  centerLng: number;
  radiusMeter: number;
};

type NormalizedSessionGeo = {
  latitude: number;
  longitude: number;
  accuracyMeter: number;
  capturedAt: Date;
  source: 'browser_geolocation';
  distanceMeter: number | null;
  insideGeofence: boolean | null;
};

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function hasAnyGeo(payload?: SessionGeoDto) {
  return payload?.latitude !== undefined || payload?.longitude !== undefined || payload?.accuracyMeter !== undefined || payload?.capturedAt !== undefined || payload?.source !== undefined;
}

function normalizeSessionGeo(payload: SessionGeoDto | undefined, required: boolean, policy?: GeofencePolicyForValidation | null): NormalizedSessionGeo | null {
  if (!hasAnyGeo(payload)) {
    if (required) throw new BadRequestException('Koordinat wajib saat geofence aktif.');
    return null;
  }

  if (
    payload?.latitude === undefined ||
    payload.longitude === undefined ||
    payload.accuracyMeter === undefined ||
    !payload.capturedAt ||
    payload.source !== 'browser_geolocation'
  ) {
    throw new BadRequestException('Data lokasi browser tidak lengkap.');
  }

  if (payload.latitude < -90 || payload.latitude > 90 || payload.longitude < -180 || payload.longitude > 180) {
    throw new BadRequestException('Koordinat lokasi tidak valid.');
  }

  const capturedAt = new Date(payload.capturedAt);
  if (Number.isNaN(capturedAt.getTime())) {
    throw new BadRequestException('Waktu pengambilan lokasi tidak valid.');
  }

  const maxAgeSeconds = numberFromEnv('SESSION_GEO_MAX_AGE_SECONDS', 120);
  const ageMs = Math.abs(Date.now() - capturedAt.getTime());
  if (ageMs > maxAgeSeconds * 1000) {
    throw new BadRequestException('Lokasi sudah kedaluwarsa. Ambil ulang lokasi.');
  }

  const maxAccuracyMeter = numberFromEnv('SESSION_GEO_MAX_ACCURACY_METER', 100);
  if (payload.accuracyMeter > maxAccuracyMeter) {
    throw new BadRequestException('Akurasi lokasi terlalu rendah. Coba lagi di area terbuka.');
  }

  const distanceMeter = policy ? haversineDistanceMeters(policy.centerLat, policy.centerLng, payload.latitude, payload.longitude) : null;
  const insideGeofence = policy ? distanceMeter !== null && distanceMeter <= policy.radiusMeter : null;

  return {
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracyMeter: payload.accuracyMeter,
    capturedAt,
    source: payload.source,
    distanceMeter,
    insideGeofence
  };
}

function dayBounds(value: Date | string) {
  return jakartaBusinessDayBounds(value);
}

function dateOnly(value: Date) {
  return jakartaBusinessDayBounds(value).date;
}

function minutesOf(time: string | null | undefined, fallback: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return hour * 60 + minute;
}

function sessionAtOrAfter(sessionTime: Date, time: string | null | undefined, fallback: number) {
  return localMinutesOfDay(sessionTime) >= minutesOf(time, fallback);
}

@Injectable()
export class AttendanceClassService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly accessPolicy?: AccessPolicyService
  ) {}

  private async getAttendancePolicy() {
    const existing = await this.prisma.attendancePolicy.findUnique({ where: { id: 1 } });
    if (existing) return existing;
    return this.prisma.attendancePolicy.create({ data: { id: 1 } });
  }

  private async eligibilityForStudents(studentIds: string[], sessionStartsAt: Date) {
    const ids = Array.from(new Set(studentIds.filter(Boolean)));
    const policy = await this.getAttendancePolicy();
    const { start, end } = dayBounds(sessionStartsAt);
    const attendanceDate = dateOnly(sessionStartsAt);
    const requireDhuha = policy.requireStudentDhuha && sessionAtOrAfter(sessionStartsAt, policy.dhuhaStartTime, 7 * 60);
    const requireDzuhur = policy.requireStudentDzuhur && sessionAtOrAfter(sessionStartsAt, policy.dzuhurStartTime, 11 * 60 + 45);

    if (!policy.requireStudentClassEligibility || !ids.length) {
      return new Map(ids.map((studentId) => [studentId, {
        allowed: true,
        locked: false,
        reasons: [],
        requirements: {
          gateIn: true,
          dhuha: !requireDhuha,
          dzuhur: !requireDzuhur,
          override: false
        }
      }]));
    }

    const [gateLogs, prayerLogs, overrides] = await Promise.all([
      policy.requireStudentGateInBeforeClass ? this.prisma.gateLog.findMany({
        where: { userId: { in: ids }, direction: 'IN', tappedAt: { gte: start, lte: end } },
        select: { userId: true }
      }) : Promise.resolve([]),
      (requireDhuha || requireDzuhur) ? this.prisma.prayerAttendanceLog.findMany({
        where: { studentId: { in: ids }, attendanceDate, prayerType: { in: [PrayerType.DHUHA, PrayerType.DZUHUR] } },
        select: { studentId: true, prayerType: true }
      }) : Promise.resolve([]),
      policy.allowManualOverride ? this.prisma.attendanceOverride.findMany({
        where: {
          studentId: { in: ids },
          date: attendanceDate,
          scope: { in: [AttendanceOverrideScope.ALL, AttendanceOverrideScope.CLASS_ELIGIBILITY] },
          status: OverrideApprovalStatus.APPROVED,
          expiresAt: { gt: new Date() },
          revokedAt: null
        },
        select: { id: true, studentId: true, reason: true, scope: true }
      }) : Promise.resolve([])
    ]);

    const gateSet = new Set(gateLogs.map((item) => item.userId));
    const dhuhaSet = new Set(prayerLogs.filter((item) => item.prayerType === PrayerType.DHUHA).map((item) => item.studentId));
    const dzuhurSet = new Set(prayerLogs.filter((item) => item.prayerType === PrayerType.DZUHUR).map((item) => item.studentId));
    const overrideMap = new Map(overrides.map((item) => [item.studentId, item]));

    return new Map(ids.map((studentId) => {
      const missing: string[] = [];
      const hasGate = !policy.requireStudentGateInBeforeClass || gateSet.has(studentId);
      const hasDhuha = !requireDhuha || dhuhaSet.has(studentId);
      const hasDzuhur = !requireDzuhur || dzuhurSet.has(studentId);
      const override = overrideMap.get(studentId);
      if (!hasGate) missing.push('Belum scan gerbang masuk');
      if (!hasDhuha) missing.push('Belum scan Dhuha');
      if (!hasDzuhur) missing.push('Belum scan Dzuhur');
      const allowed = missing.length === 0 || Boolean(override);
      return [studentId, {
        allowed,
        locked: !allowed,
        reasons: override ? [`Diizinkan manual: ${override.reason}`] : missing,
        requirements: {
          gateIn: hasGate,
          dhuha: hasDhuha,
          dzuhur: hasDzuhur,
          override: Boolean(override)
        }
      }];
    }));
  }

  async listSessions(user: AuthenticatedUser, pagination: PaginationQuery, date?: string) {
    const where: Prisma.SessionWhereInput = {};

    if (date) {
      const { start, end } = dayBounds(date);
      where.startsAt = { gte: start, lte: end };
    }

    if (user.role === Role.GURU_MAPEL) {
      where.teacherId = user.sub;
    }

    const [total, items] = await Promise.all([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        include: {
          schoolClass: { select: { id: true, code: true, name: true } },
          subject: { select: { id: true, code: true, name: true } },
          teacher: { select: { id: true, fullName: true } },
          teacherPresence: {
            select: {
              teacherId: true,
              status: true,
              checkInAt: true,
              checkOutAt: true,
              earlyCheckoutReason: true
            }
          }
        },
        orderBy: { startsAt: 'asc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }

  async openSession(sessionId: string, actor: AuthenticatedUser, geo?: SessionGeoDto) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    if (this.accessPolicy && !await this.accessPolicy.canOpenSession(actor, sessionId)) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }
    if (!this.accessPolicy && actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    const policy = await this.prisma.geofencePolicy.findUnique({ where: { id: 1 } });
    if (policy && !policy.allowPicketOverride && actor.role === Role.GURU_PIKET) {
      throw new ForbiddenException('Override guru piket sedang dinonaktifkan.');
    }

    const validatedGeo = normalizeSessionGeo(geo, Boolean(policy?.enforceSessionOpen), policy);
    if (policy?.enforceSessionOpen && validatedGeo?.insideGeofence === false) {
      throw new ForbiddenException('Di luar area sekolah.');
    }

    let gateTapSatisfied: boolean | null = policy?.requireGateTapForOpen ? false : null;
    if (policy?.requireGateTapForOpen) {
      const { start: dayStart, end: dayEnd } = dayBounds(new Date());

      const gateTap = await this.prisma.gateLog.findFirst({
        where: {
          userId: actor.sub,
          direction: 'IN',
          tappedAt: {
            gte: dayStart,
            lte: dayEnd
          }
        }
      });

      if (!gateTap) {
        throw new ForbiddenException('Guru belum tap gerbang hari ini.');
      }
      gateTapSatisfied = true;
    }

    return this.prisma.$transaction(async (tx) => {
      const checkInAt = new Date();
      const teacherStatus = actor.sub === session.teacherId
        ? teacherStatusForCheckIn(session.startsAt, policy?.arrivalGraceMinutes)
        : TeacherSessionStatus.EXCUSED_ABSENCE;

      const opened = await tx.session.updateMany({
        where: { id: sessionId, status: SessionStatus.SCHEDULED },
        data: {
          status: SessionStatus.OPEN,
          openedAt: checkInAt
        }
      });
      if (opened.count !== 1) throw new ConflictException('Sesi hanya dapat dibuka dari status SCHEDULED.');
      const updated = await tx.session.findUniqueOrThrow({ where: { id: sessionId } });

      const roster = await tx.classEnrollment.findMany({
        where: { classId: session.classId, student: { active: true, role: Role.SISWA } },
        select: { studentId: true }
      });
      if (roster.length) {
        await tx.studentAttendance.createMany({
          data: roster.map((item) => ({ sessionId, studentId: item.studentId, status: StudentAttendanceStatus.ALPA })),
          skipDuplicates: true
        });
      }

      const teacherPresence = await tx.teacherSessionPresence.upsert({
        where: {
          sessionId_teacherId: {
            sessionId,
            teacherId: session.teacherId
          }
        },
        update: {
          status: teacherStatus,
          checkInAt,
          checkInLat: validatedGeo?.latitude ?? null,
          checkInLng: validatedGeo?.longitude ?? null,
          checkInById: actor.sub,
          checkOutAt: null,
          checkOutLat: null,
          checkOutLng: null,
          checkOutById: null,
          earlyCheckoutReason: null
        },
        create: {
          sessionId,
          teacherId: session.teacherId,
          status: teacherStatus,
          checkInAt,
          checkInLat: validatedGeo?.latitude ?? null,
          checkInLng: validatedGeo?.longitude ?? null,
          checkInById: actor.sub
        }
      });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'attendance',
        action: 'teacher.session.checkin',
        resource: 'teacherSessionPresence',
        resourceId: teacherPresence.id,
        after: {
          sessionId,
          teacherId: session.teacherId,
          checkInAt,
          status: teacherStatus,
          latitude: validatedGeo?.latitude ?? null,
          longitude: validatedGeo?.longitude ?? null,
          accuracyMeter: validatedGeo?.accuracyMeter ?? null,
          capturedAt: validatedGeo?.capturedAt.toISOString() ?? null,
          source: validatedGeo?.source ?? null,
          distanceMeter: validatedGeo?.distanceMeter ?? null,
          insideGeofence: validatedGeo?.insideGeofence ?? null,
          geofenceEnforced: Boolean(policy?.enforceSessionOpen),
          gateTapRequired: Boolean(policy?.requireGateTapForOpen),
          gateTapSatisfied
        }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'attendance',
        action: 'class.session.opened',
        resource: 'session',
        resourceId: sessionId,
        after: updated as unknown as Prisma.InputJsonValue
      });

      return {
        ...updated,
        teacherPresence
      };
    });
  }

  async recordAttendance(sessionId: string, actor: AuthenticatedUser, payload: BatchAttendanceDto) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    if (this.accessPolicy && !await this.accessPolicy.canWriteClassAttendance(actor, sessionId)) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }
    if (!this.accessPolicy && actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    if (session.status !== SessionStatus.OPEN) {
      throw new BadRequestException('Sesi belum OPEN.');
    }

    const enrolled = await this.prisma.classEnrollment.findMany({
      where: { classId: session.classId, student: { active: true, role: Role.SISWA } },
      select: { studentId: true }
    });
    const rosterSet = new Set(enrolled.map((item) => item.studentId));
    const outOfRoster = payload.items.filter((item) => !rosterSet.has(item.studentId)).map((item) => item.studentId);
    if (outOfRoster.length) {
      await this.prisma.$transaction(async (tx) => {
        await writeAudit(tx, {
          actorId: actor.sub,
          actorRole: actor.role as Role,
          module: 'attendance',
          action: 'attendance.class.rejected_out_of_roster',
          resource: 'session',
          resourceId: sessionId,
          after: { outOfRoster }
        });
      });
      throw new BadRequestException('Ada siswa yang bukan roster kelas sesi ini.');
    }

    const eligibilityMap = await this.eligibilityForStudents(payload.items.map((item) => item.studentId), session.startsAt);
    const rejected = payload.items
      .filter((item) => (item.status === StudentAttendanceStatus.HADIR || item.status === StudentAttendanceStatus.TELAT) && eligibilityMap.get(item.studentId)?.locked)
      .map((item) => ({
        studentId: item.studentId,
        status: item.status,
        reasons: eligibilityMap.get(item.studentId)?.reasons ?? ['Syarat presensi belum lengkap']
      }));
    const rejectedIds = new Set(rejected.map((item) => item.studentId));
    const allowedItems = payload.items.filter((item) => !rejectedIds.has(item.studentId));

    return this.prisma.$transaction(async (tx) => {
      const stillOpen = await tx.session.updateMany({ where: { id: sessionId, status: SessionStatus.OPEN }, data: { updatedAt: new Date() } });
      if (stillOpen.count !== 1) throw new ConflictException('Sesi sudah tidak OPEN. Presensi baru ditolak.');
      const result = [];
      for (const item of allowedItems) {
        const attendance = await tx.studentAttendance.upsert({
          where: {
            sessionId_studentId: {
              sessionId,
              studentId: item.studentId
            }
          },
          create: {
            sessionId,
            studentId: item.studentId,
            status: item.status,
            note: item.note
          },
          update: {
            status: item.status,
            note: item.note
          }
        });
        result.push(attendance);
      }

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'attendance',
        action: 'class.attendance.recorded',
        resource: 'session',
        resourceId: sessionId,
        after: { count: result.length, rejectedCount: rejected.length }
      });

      if (rejected.length) {
        await writeAudit(tx, {
          actorId: actor.sub,
          actorRole: actor.role as Role,
          module: 'attendance',
          action: 'attendance.class.blocked_by_policy',
          resource: 'session',
          resourceId: sessionId,
          after: { rejected }
        });
      }

      return {
        updated: result.length,
        rejected,
        rejectedCount: rejected.length,
        message: rejected.length ? 'Sebagian siswa belum memenuhi syarat scan wajib sehingga tidak disimpan sebagai hadir/telat.' : 'Presensi siswa tersimpan.'
      };
    });
  }

  async closeSession(sessionId: string, actor: AuthenticatedUser, payload: CloseSessionDto = {}) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    if (this.accessPolicy && !await this.accessPolicy.canCloseSession(actor, sessionId)) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }
    if (!this.accessPolicy && actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    if (session.status !== SessionStatus.OPEN) {
      throw new BadRequestException('Sesi tidak dalam status OPEN.');
    }

    const closeGeo = normalizeSessionGeo(payload, false, null);
    const now = new Date();
    const isEarlyCheckout = now.getTime() < session.endsAt.getTime();
    const earlyCheckoutReason = payload.earlyCheckoutReason?.trim();
    if (isEarlyCheckout && !earlyCheckoutReason) {
      throw new BadRequestException('Guru keluar sebelum jam selesai. Isi alasan keluar lebih awal minimal 10 karakter.');
    }

    return this.prisma.$transaction(async (tx) => {
      const roster = await tx.classEnrollment.findMany({
        where: { classId: session.classId, student: { active: true, role: Role.SISWA } },
        select: { studentId: true }
      });
      if (roster.length) {
        await tx.studentAttendance.createMany({
          data: roster.map((item) => ({ sessionId, studentId: item.studentId, status: StudentAttendanceStatus.ALPA })),
          skipDuplicates: true
        });
      }
      const closed = await tx.session.updateMany({
        where: { id: sessionId, status: SessionStatus.OPEN },
        data: {
          status: SessionStatus.CLOSED,
          closedAt: now,
          reconciledAt: null
        }
      });
      if (closed.count !== 1) throw new ConflictException('Sesi sudah tidak OPEN.');
      const updated = await tx.session.findUniqueOrThrow({ where: { id: sessionId } });

      const existingPresence = await tx.teacherSessionPresence.findUnique({
        where: {
          sessionId_teacherId: {
            sessionId,
            teacherId: session.teacherId
          }
        }
      });
      const teacherStatus = existingPresence?.status ?? (actor.sub === session.teacherId ? TeacherSessionStatus.HADIR : TeacherSessionStatus.EXCUSED_ABSENCE);

      const teacherPresence = await tx.teacherSessionPresence.upsert({
        where: {
          sessionId_teacherId: {
            sessionId,
            teacherId: session.teacherId
          }
        },
        update: {
          status: teacherStatus,
          checkOutAt: now,
          checkOutLat: closeGeo?.latitude ?? null,
          checkOutLng: closeGeo?.longitude ?? null,
          checkOutById: actor.sub,
          earlyCheckoutReason: isEarlyCheckout ? earlyCheckoutReason : null
        },
        create: {
          sessionId,
          teacherId: session.teacherId,
          status: teacherStatus,
          checkOutAt: now,
          checkOutLat: closeGeo?.latitude ?? null,
          checkOutLng: closeGeo?.longitude ?? null,
          checkOutById: actor.sub,
          earlyCheckoutReason: isEarlyCheckout ? earlyCheckoutReason : null
        }
      });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'attendance',
        action: 'teacher.session.checkout',
        resource: 'teacherSessionPresence',
        resourceId: teacherPresence.id,
        reason: isEarlyCheckout ? earlyCheckoutReason : null,
        after: {
          sessionId,
          teacherId: session.teacherId,
          checkOutAt: now,
          durationMinutes: durationMinutes(teacherPresence.checkInAt, teacherPresence.checkOutAt),
          earlyCheckout: isEarlyCheckout,
          latitude: closeGeo?.latitude ?? null,
          longitude: closeGeo?.longitude ?? null,
          accuracyMeter: closeGeo?.accuracyMeter ?? null,
          capturedAt: closeGeo?.capturedAt.toISOString() ?? null,
          source: closeGeo?.source ?? null,
          distanceMeter: closeGeo?.distanceMeter ?? null,
          insideGeofence: closeGeo?.insideGeofence ?? null,
          geofenceEnforced: false
        }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'attendance',
        action: 'class.session.closed',
        resource: 'session',
        resourceId: sessionId,
        reason: isEarlyCheckout ? earlyCheckoutReason : null,
        after: updated as unknown as Prisma.InputJsonValue
      });

      return {
        ...updated,
        teacherPresence
      };
    });
  }

  async summary(sessionId: string, actor?: AuthenticatedUser) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        attendances: true,
        teacherPresence: true,
        schoolClass: {
          include: {
            enrollments: {
              where: {
                student: {
                  active: true
                }
              }
            }
          }
        }
      }
    });

    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }
    if (actor && actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    const counters = {
      [StudentAttendanceStatus.HADIR]: 0,
      [StudentAttendanceStatus.TELAT]: 0,
      [StudentAttendanceStatus.IZIN]: 0,
      [StudentAttendanceStatus.SAKIT]: 0,
      [StudentAttendanceStatus.ALPA]: 0
    };

    for (const item of session.attendances) {
      counters[item.status] += 1;
    }

    const teacherPresence = session.teacherPresence.find((item) => item.teacherId === session.teacherId) ?? null;

    return {
      sessionId,
      status: session.status,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      teacherPresence,
      teacherDurationMinutes: durationMinutes(teacherPresence?.checkInAt, teacherPresence?.checkOutAt),
      enrolledCount: session.schoolClass.enrollments.length,
      recordedCount: session.attendances.length,
      counters
    };
  }

  async roster(sessionId: string, actor: AuthenticatedUser) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        schoolClass: {
          include: {
            enrollments: {
              where: {
                student: {
                  active: true
                }
              },
              include: {
                student: {
                  select: {
                    id: true,
                    fullName: true,
                    username: true,
                    cardStatus: true
                  }
                }
              },
              orderBy: {
                student: {
                  fullName: 'asc'
                }
              }
            }
          }
        },
        attendances: true,
        teacherPresence: true
      }
    });

    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    if (actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    const attendanceMap = new Map(session.attendances.map((item) => [item.studentId, item]));
    const eligibilityMap = await this.eligibilityForStudents(session.schoolClass.enrollments.map((item) => item.studentId), session.startsAt);
    const roster = session.schoolClass.enrollments.map((enrollment) => {
      const existing = attendanceMap.get(enrollment.studentId);
      const eligibility = eligibilityMap.get(enrollment.studentId) ?? { allowed: true, locked: false, reasons: [], requirements: { gateIn: true, dhuha: true, dzuhur: true, override: false } };
      return {
        studentId: enrollment.studentId,
        fullName: enrollment.student.fullName,
        username: enrollment.student.username,
        cardStatus: enrollment.student.cardStatus,
        status: existing?.status ?? StudentAttendanceStatus.ALPA,
        note: existing?.note ?? null,
        updatedAt: existing?.updatedAt ?? null,
        eligibility
      };
    });

    return {
      session: {
        id: session.id,
        status: session.status,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        teacherPresence: session.teacherPresence.find((item) => item.teacherId === session.teacherId) ?? null
      },
      roster
    };
  }

  async correctAttendance(
    sessionId: string,
    studentId: string,
    actor: AuthenticatedUser,
    payload: CorrectAttendanceDto
  ) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    if (this.accessPolicy && !await this.accessPolicy.canCorrectAttendance(actor, sessionId, studentId)) {
      throw new ForbiddenException('Bukan sesi Anda atau siswa bukan roster kelas ini.');
    }
    if (!this.accessPolicy && actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    if (session.status === SessionStatus.SCHEDULED) {
      throw new BadRequestException('Koreksi hanya bisa dilakukan setelah sesi berjalan.');
    }

    const reason = assertReasonQuality(payload.reason, 'Alasan koreksi');
    const enrollment = await this.prisma.classEnrollment.findUnique({ where: { classId_studentId: { classId: session.classId, studentId } } });
    if (!enrollment) throw new BadRequestException('Siswa bukan roster kelas sesi ini.');

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.studentAttendance.findUnique({ where: { sessionId_studentId: { sessionId, studentId } } });
      const attendance = await tx.studentAttendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId } },
        create: {
          sessionId,
          studentId,
          status: payload.status,
          note: payload.note,
          evidenceLabel: 'corrected',
          correctionCount: 1,
          correctedAt: new Date(),
          correctedById: actor.sub
        },
        update: {
          status: payload.status,
          note: payload.note,
          evidenceLabel: 'corrected',
          correctionCount: { increment: 1 },
          correctedAt: new Date(),
          correctedById: actor.sub
        }
      });

      await tx.attendanceCorrectionEvent.create({
        data: {
          attendanceId: attendance.id,
          sessionId,
          studentId,
          actorId: actor.sub,
          beforeStatus: before?.status ?? null,
          afterStatus: attendance.status,
          beforeNote: before?.note ?? null,
          afterNote: attendance.note ?? null,
          reason,
          before: before ? { status: before.status, note: before.note } : Prisma.JsonNull,
          after: { status: attendance.status, note: attendance.note }
        }
      });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'attendance',
        action: 'class.attendance.corrected',
        resource: 'studentAttendance',
        resourceId: attendance.id,
        reason,
        before: before ? { status: before.status, note: before.note } : null,
        after: { status: attendance.status, note: attendance.note, correctionCount: attendance.correctionCount }
      });

      return attendance;
    });
  }
}
