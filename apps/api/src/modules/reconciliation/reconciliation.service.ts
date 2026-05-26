import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationType,
  PrayerType,
  Prisma,
  ReconciliationFlagType,
  ReconciliationStatus,
  ReconciliationPriority,
  Role,
  SessionStatus,
  StudentAttendanceStatus,
  TeacherLeaveStatus,
  TeacherSessionStatus
} from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import type { RequestMeta } from '../../common/request-meta';
import { PrismaService } from '../../prisma/prisma.service';

function minutesOf(time: string | null | undefined, fallback: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return hour * 60 + minute;
}

function sessionEndsAtOrAfter(sessionEndsAt: Date, time: string | null | undefined, fallback: number) {
  const minute = sessionEndsAt.getHours() * 60 + sessionEndsAt.getMinutes();
  return minute >= minutesOf(time, fallback);
}

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async listFlags(
    status: ReconciliationStatus | undefined,
    type: ReconciliationFlagType | undefined,
    pagination: PaginationQuery,
    filters?: {
      from?: string;
      to?: string;
    }
  ) {
    const where: Prisma.ReconciliationFlagWhereInput = {
      ...(status ? { status } : {}),
      ...(type ? { type } : {})
    };

    if (filters?.from || filters?.to) {
      const createdAtFilter: Prisma.DateTimeFilter = {};
      if (filters.from) {
        const start = new Date(filters.from);
        if (Number.isNaN(start.getTime())) {
          throw new BadRequestException('Parameter from tidak valid.');
        }
        start.setHours(0, 0, 0, 0);
        createdAtFilter.gte = start;
      }
      if (filters.to) {
        const end = new Date(filters.to);
        if (Number.isNaN(end.getTime())) {
          throw new BadRequestException('Parameter to tidak valid.');
        }
        end.setHours(23, 59, 59, 999);
        createdAtFilter.lte = end;
      }
      where.createdAt = createdAtFilter;
    }

    const [total, items] = await Promise.all([
      this.prisma.reconciliationFlag.count({ where }),
      this.prisma.reconciliationFlag.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, role: true } },
          session: {
            include: {
              schoolClass: { select: { code: true, name: true } },
              subject: { select: { code: true, name: true } }
            }
          },
          resolvedBy: { select: { id: true, fullName: true } },
          assignedTo: { select: { id: true, fullName: true, role: true } },
          escalations: {
            include: {
              createdBy: {
                select: { id: true, fullName: true, role: true }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        escalationQueue: item.escalations.find((entry) => entry.status === 'QUEUED') ?? null
      })),
      meta: buildPaginationMeta(total, pagination)
    };
  }

  async resolveFlag(
    flagId: string,
    reason: string,
    actor: { sub: string; role: Role },
    requestMeta?: RequestMeta
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.reconciliationFlag.findUnique({ where: { id: flagId } });
      if (!current) {
        throw new NotFoundException('Flag tidak ditemukan.');
      }
      if (current.status !== ReconciliationStatus.OPEN) {
        throw new BadRequestException('Flag sudah tidak OPEN.');
      }

      const resolvedAt = new Date();
      const updated = await tx.reconciliationFlag.update({
        where: { id: flagId },
        data: {
          status: ReconciliationStatus.RESOLVED,
          reviewStatus: 'RESOLVED',
          resolvedAt,
          resolvedById: actor.sub,
          resolvedReason: reason
        }
      });

      const closedQueue = await tx.reconciliationEscalation.updateMany({
        where: {
          flagId,
          status: 'QUEUED'
        },
        data: {
          status: 'CLOSED',
          closedAt: resolvedAt,
          closedById: actor.sub
        }
      });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'reconciliation.flag.resolved',
        module: 'reconciliation',
        resource: 'reconciliationFlag',
        resourceId: flagId,
        reason,
        requestIp: requestMeta?.requestIp ?? null,
        requestDevice: requestMeta?.requestDevice ?? null,
        after: {
          ...updated,
          closedEscalationCount: closedQueue.count
        }
      });

      return updated;
    });
  }

  async updateFlagWorkflow(
    flagId: string,
    payload: {
      reviewStatus?: Prisma.ReconciliationFlagUpdateInput['reviewStatus'];
      priority?: Prisma.ReconciliationFlagUpdateInput['priority'];
      assignedToId?: string;
      followUpNote?: string;
      dueAt?: string;
    },
    actor: { sub: string; role: Role },
    requestMeta?: RequestMeta
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.reconciliationFlag.findUnique({ where: { id: flagId } });
      if (!current) throw new NotFoundException('Flag tidak ditemukan.');
      if (current.status !== ReconciliationStatus.OPEN) {
        throw new BadRequestException('Flag yang sudah selesai tidak dapat diubah tindak lanjutnya.');
      }

      const updated = await tx.reconciliationFlag.update({
        where: { id: flagId },
        data: {
          ...(payload.reviewStatus ? { reviewStatus: payload.reviewStatus } : {}),
          ...(payload.priority ? { priority: payload.priority } : {}),
          ...(payload.assignedToId !== undefined ? { assignedToId: payload.assignedToId || null } : {}),
          ...(payload.followUpNote !== undefined ? { followUpNote: payload.followUpNote || null } : {}),
          ...(payload.dueAt !== undefined ? { dueAt: payload.dueAt ? new Date(payload.dueAt) : null } : {})
        },
        include: {
          assignedTo: { select: { id: true, fullName: true } },
          user: { select: { id: true, fullName: true, role: true } }
        }
      });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'reconciliation.flag.workflow_updated',
        module: 'reconciliation',
        resource: 'reconciliationFlag',
        resourceId: flagId,
        reason: payload.followUpNote,
        requestIp: requestMeta?.requestIp ?? null,
        requestDevice: requestMeta?.requestDevice ?? null,
        before: current,
        after: updated
      });

      if (updated.assignedToId) {
        await tx.notification.create({
          data: {
            userId: updated.assignedToId,
            type: NotificationType.ANOMALY_NEW,
            title: 'Tugas anomali baru',
            body: `Anda ditugaskan menindaklanjuti ${updated.type}.`,
            href: '/admin/anomaly'
          }
        });
      }

      return updated;
    });
  }

  async escalateFlag(
    flagId: string,
    reason: string,
    actor: { sub: string; role: Role },
    requestMeta?: RequestMeta
  ) {
    return this.prisma.$transaction(async (tx) => {
      const flag = await tx.reconciliationFlag.findUnique({
        where: { id: flagId }
      });
      if (!flag) {
        throw new NotFoundException('Flag tidak ditemukan.');
      }
      if (flag.status !== ReconciliationStatus.OPEN) {
        throw new BadRequestException('Hanya flag OPEN yang dapat dieskalasi.');
      }

      const queued = await tx.reconciliationEscalation.findFirst({
        where: {
          flagId,
          status: 'QUEUED'
        }
      });
      if (queued) {
        throw new BadRequestException('Flag sudah berada pada antrean eskalasi.');
      }

      await tx.reconciliationFlag.update({
        where: { id: flagId },
        data: { reviewStatus: 'ESCALATED', priority: 'HIGH' }
      });

      const escalation = await tx.reconciliationEscalation.create({
        data: {
          flagId,
          reason,
          createdById: actor.sub,
          status: 'QUEUED'
        },
        include: {
          createdBy: {
            select: { id: true, fullName: true, role: true }
          }
        }
      });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        action: 'reconciliation.flag.escalated',
        module: 'reconciliation',
        resource: 'reconciliationEscalation',
        resourceId: escalation.id,
        reason,
        requestIp: requestMeta?.requestIp ?? null,
        requestDevice: requestMeta?.requestDevice ?? null,
        after: {
          flagId,
          status: escalation.status
        }
      });

      return escalation;
    });
  }

  async runAutoMissedSessions(actorId?: string) {
    const policy = await this.prisma.geofencePolicy.findUnique({ where: { id: 1 } });
    const graceMinutes = policy?.autoMissedGraceMinutes ?? 15;
    const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000);

    const sessions = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.SCHEDULED,
        startsAt: { lt: cutoff }
      },
      include: {
        teacher: { select: { id: true, fullName: true } },
        schoolClass: { select: { code: true, name: true } },
        subject: { select: { name: true } }
      },
      orderBy: { startsAt: 'asc' },
      take: 200
    });

    const processed = [];
    for (const session of sessions) {
      const dayStart = new Date(session.startsAt);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(session.startsAt);
      dayEnd.setHours(23, 59, 59, 999);

      const approvedLeave = await this.prisma.teacherLeave.findFirst({
        where: {
          teacherId: session.teacherId,
          status: TeacherLeaveStatus.APPROVED,
          date: { gte: dayStart, lte: dayEnd }
        }
      });

      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.session.update({
          where: { id: session.id },
          data: {
            status: SessionStatus.MISSED,
            closedAt: new Date(),
            reconciledAt: null
          }
        });

        await tx.teacherSessionPresence.upsert({
          where: { sessionId_teacherId: { sessionId: session.id, teacherId: session.teacherId } },
          update: { status: approvedLeave ? TeacherSessionStatus.EXCUSED_ABSENCE : TeacherSessionStatus.ALPA_MENGAJAR },
          create: {
            sessionId: session.id,
            teacherId: session.teacherId,
            status: approvedLeave ? TeacherSessionStatus.EXCUSED_ABSENCE : TeacherSessionStatus.ALPA_MENGAJAR
          }
        });

        await writeAudit(tx, {
          actorId,
          action: 'session.missed',
          module: 'scheduling',
          resource: 'session',
          resourceId: session.id,
          after: {
            status: updated.status,
            teacherId: session.teacherId,
            classCode: session.schoolClass.code,
            subjectName: session.subject.name,
            approvedLeaveId: approvedLeave?.id ?? null
          }
        });

        await tx.notification.createMany({
          data: [Role.ADMIN_TU, Role.GURU_PIKET].map((role) => ({
            role,
            type: NotificationType.SESSION_MISSED,
            title: 'Sesi terlewat otomatis',
            body: `${session.subject.name} · ${session.schoolClass.code} belum dibuka sampai batas waktu.`,
            href: '/admin/sessions'
          }))
        });
      });

      const reconciliation = await this.reconcileSession(session.id, actorId);
      processed.push({ sessionId: session.id, approvedLeave: Boolean(approvedLeave), reconciliation });
    }

    return { graceMinutes, pending: sessions.length, processed };
  }

  async runPendingReconciliation(actorId?: string) {
    const pendingSessions = await this.prisma.session.findMany({
      where: {
        status: { in: ['CLOSED', 'MISSED'] },
        reconciledAt: null
      },
      take: 200,
      orderBy: { closedAt: 'asc' }
    });

    const processed = [];
    for (const session of pendingSessions) {
      const result = await this.reconcileSession(session.id, actorId);
      processed.push(result);
    }

    return {
      pending: pendingSessions.length,
      processed
    };
  }

  async reconcileSession(sessionId: string, actorId?: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        schoolClass: {
          include: {
            enrollments: true
          }
        },
        attendances: true,
        teacherPresence: true
      }
    });

    if (!session) {
      return { sessionId, createdFlags: 0, message: 'session-not-found' };
    }

    const dayStart = new Date(session.startsAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(session.startsAt);
    dayEnd.setHours(23, 59, 59, 999);

    const involvedUserIds = new Set<string>([
      session.teacherId,
      ...session.schoolClass.enrollments.map((enrollment) => enrollment.studentId)
    ]);

    const [gateLogs, prayerLogs, attendancePolicy, overrides] = await Promise.all([
      this.prisma.gateLog.findMany({
        where: {
          userId: { in: Array.from(involvedUserIds) },
          tappedAt: { gte: dayStart, lte: dayEnd }
        },
        orderBy: { tappedAt: 'asc' }
      }),
      this.prisma.prayerAttendanceLog.findMany({
        where: {
          studentId: { in: session.schoolClass.enrollments.map((enrollment) => enrollment.studentId) },
          attendanceDate: dayStart
        }
      }),
      this.prisma.attendancePolicy.findUnique({ where: { id: 1 } }),
      this.prisma.attendanceOverride.findMany({
        where: {
          studentId: { in: session.schoolClass.enrollments.map((enrollment) => enrollment.studentId) },
          date: dayStart,
          status: 'APPROVED',
          expiresAt: { gt: new Date() },
          revokedAt: null
        }
      })
    ]);

    const hasGateIn = new Set(gateLogs.filter((log) => log.direction === 'IN').map((log) => log.userId));
    const hasDhuha = new Set(prayerLogs.filter((log) => log.prayerType === PrayerType.DHUHA).map((log) => log.studentId));
    const hasDzuhur = new Set(prayerLogs.filter((log) => log.prayerType === PrayerType.DZUHUR).map((log) => log.studentId));
    const hasAshar = new Set(prayerLogs.filter((log) => log.prayerType === PrayerType.ASHAR).map((log) => log.studentId));
    const overrideMap = new Map<string, typeof overrides[number]>();
    for (const override of overrides) overrideMap.set(override.studentId, override);
    const requireDhuha = attendancePolicy?.requireStudentDhuha ?? false;
    const requireDzuhur = attendancePolicy?.requireStudentDzuhur ?? false;
    const requireAshar = Boolean(attendancePolicy?.requireStudentAsharForAfternoon) && sessionEndsAtOrAfter(session.endsAt, attendancePolicy?.asharRequiredClassEndTime, 15 * 60);
    const attendanceMap = new Map(session.attendances.map((attendance) => [attendance.studentId, attendance]));

    let createdFlags = 0;

    const gateLogsByUser = new Map<string, typeof gateLogs>();
    for (const log of gateLogs) {
      const rows = gateLogsByUser.get(log.userId) ?? [];
      rows.push(log);
      gateLogsByUser.set(log.userId, rows);
    }

    for (const [userId, logs] of gateLogsByUser.entries()) {
      let inside = false;
      let lastInAt: Date | null = null;
      for (const log of logs) {
        if (log.direction === 'OUT' && !inside) {
          await this.createFlag(ReconciliationFlagType.OUT_TANPA_IN, session.id, userId, {
            outLogId: log.id,
            outAt: log.tappedAt,
            reason: 'Scan keluar tanpa scan masuk valid sebelumnya pada hari yang sama.'
          }, { priority: ReconciliationPriority.HIGH, classId: session.classId, recommendation: 'Verifikasi kartu/reader dan jangan finalkan laporan sebelum jelas.' });
          createdFlags += 1;
        }
        if (log.direction === 'IN' && inside) {
          await this.createFlag(ReconciliationFlagType.IN_BERULANG, session.id, userId, {
            inLogId: log.id,
            inAt: log.tappedAt,
            reason: 'Scan masuk berulang tanpa scan keluar.'
          }, { priority: ReconciliationPriority.NORMAL, classId: session.classId, recommendation: 'Periksa kemungkinan scan ganda atau titip kartu.' });
          createdFlags += 1;
        }
        if (log.direction === 'OUT' && inside && lastInAt) {
          const minutesSinceIn = Math.round((log.tappedAt.getTime() - lastInAt.getTime()) / 60000);
          if (minutesSinceIn < 10) {
            await this.createFlag(ReconciliationFlagType.OUT_TERLALU_CEPAT, session.id, userId, {
              outLogId: log.id,
              minutesSinceIn,
              reason: 'Jarak scan masuk dan keluar terlalu dekat.'
            }, { priority: ReconciliationPriority.HIGH, classId: session.classId, recommendation: 'Periksa apakah kartu dititipkan atau siswa/guru langsung keluar.' });
            createdFlags += 1;
          }
        }
        if (log.direction === 'IN') {
          inside = true;
          lastInAt = log.tappedAt;
        }
        if (log.direction === 'OUT') inside = false;
      }
    }

    for (const enrollment of session.schoolClass.enrollments) {
      const attendance = attendanceMap.get(enrollment.studentId);
      if (!attendance) {
        if (hasGateIn.has(enrollment.studentId)) {
          await this.createFlag(ReconciliationFlagType.GATE_IN_TANPA_PRESENSI, session.id, enrollment.studentId, {
            gateIn: true,
            classStatus: null,
            reason: 'Siswa scan masuk gerbang tetapi tidak punya catatan presensi kelas.'
          }, { priority: ReconciliationPriority.HIGH, classId: session.classId, recommendation: 'Guru/petugas wajib verifikasi sebelum laporan final.' });
          createdFlags += 1;
        }
        continue;
      }

      if ((attendance.status === StudentAttendanceStatus.HADIR || attendance.status === StudentAttendanceStatus.TELAT) && overrideMap.has(enrollment.studentId)) {
        await this.createFlag(ReconciliationFlagType.HADIR_VIA_OVERRIDE, session.id, enrollment.studentId, {
          classStatus: attendance.status,
          overrideId: overrideMap.get(enrollment.studentId)?.id,
          scope: overrideMap.get(enrollment.studentId)?.scope
        }, { priority: ReconciliationPriority.NORMAL, classId: session.classId, recommendation: 'Review data hadir via override sebelum laporan final.' });
        createdFlags += 1;
      }

      if (attendance.status === StudentAttendanceStatus.ALPA && hasGateIn.has(enrollment.studentId)) {
        await this.createFlag(ReconciliationFlagType.BOLOS_KELAS, session.id, enrollment.studentId, {
          gateIn: true,
          classStatus: attendance.status
        });
        createdFlags += 1;
      }

      if (attendance.status === StudentAttendanceStatus.ALPA && !hasGateIn.has(enrollment.studentId)) {
        await this.createFlag(ReconciliationFlagType.ALPA, session.id, enrollment.studentId, {
          gateIn: false,
          classStatus: attendance.status
        });
        createdFlags += 1;
      }

      if (
        (attendance.status === StudentAttendanceStatus.HADIR || attendance.status === StudentAttendanceStatus.TELAT) &&
        !hasGateIn.has(enrollment.studentId)
      ) {
        await this.createFlag(ReconciliationFlagType.LUPA_TAP_GERBANG, session.id, enrollment.studentId, {
          gateIn: false,
          classStatus: attendance.status
        });
        createdFlags += 1;
      }

      if ((attendance.status === StudentAttendanceStatus.HADIR || attendance.status === StudentAttendanceStatus.TELAT) && requireDhuha && !hasDhuha.has(enrollment.studentId)) {
        await this.createFlag(ReconciliationFlagType.BELUM_SCAN_DHUHA, session.id, enrollment.studentId, {
          prayer: 'DHUHA',
          classStatus: attendance.status
        });
        createdFlags += 1;
      }

      if ((attendance.status === StudentAttendanceStatus.HADIR || attendance.status === StudentAttendanceStatus.TELAT) && requireDzuhur && !hasDzuhur.has(enrollment.studentId)) {
        await this.createFlag(ReconciliationFlagType.BELUM_SCAN_DZUHUR, session.id, enrollment.studentId, {
          prayer: 'DZUHUR',
          classStatus: attendance.status
        });
        createdFlags += 1;
      }

      if ((attendance.status === StudentAttendanceStatus.HADIR || attendance.status === StudentAttendanceStatus.TELAT) && requireAshar && !hasAshar.has(enrollment.studentId)) {
        await this.createFlag(ReconciliationFlagType.BELUM_SCAN_ASHAR, session.id, enrollment.studentId, {
          prayer: 'ASHAR',
          classStatus: attendance.status,
          requiredClassEndTime: attendancePolicy?.asharRequiredClassEndTime || '15:00'
        });
        createdFlags += 1;
      }
    }

    const teacherPresence = session.teacherPresence.find((presence) => presence.teacherId === session.teacherId);
    if (!teacherPresence || teacherPresence.status === TeacherSessionStatus.ALPA_MENGAJAR) {
      await this.createFlag(ReconciliationFlagType.TIDAK_MENGAJAR, session.id, session.teacherId, {
        teacherPresence: teacherPresence?.status ?? null,
        sessionStatus: session.status
      });
      createdFlags += 1;
    }

    if (teacherPresence && teacherPresence.status === TeacherSessionStatus.HADIR && !hasGateIn.has(session.teacherId)) {
      await this.createFlag(ReconciliationFlagType.ANOMALI_BUKA_TANPA_GERBANG, session.id, session.teacherId, {
        teacherPresence: teacherPresence.status,
        gateIn: false
      });
      createdFlags += 1;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: {
          reconciledAt: new Date()
        }
      });

      await writeAudit(tx, {
        actorId,
        action: 'reconciliation.session.processed',
        module: 'reconciliation',
        resource: 'session',
        resourceId: session.id,
        after: { createdFlags }
      });
    });

    return {
      sessionId: session.id,
      createdFlags
    };
  }

  private async createFlag(
    type: ReconciliationFlagType,
    sessionId: string,
    userId: string,
    details: Prisma.InputJsonValue,
    options: { priority?: ReconciliationPriority; classId?: string | null; recommendation?: string } = {}
  ) {
    const evidence = details;
    const recommendation = options.recommendation ?? 'Periksa bukti gerbang, mushola, kelas, dan audit sebelum menyelesaikan flag.';
    const fingerprint = [type, sessionId ?? 'no-session', userId, JSON.stringify(details)].join(':').slice(0, 512);
    await this.prisma.reconciliationFlag.upsert({
      where: { type_sessionId_userId: { type, sessionId, userId } },
      update: {
        status: ReconciliationStatus.OPEN,
        details,
        evidence,
        recommendation,
        priority: options.priority ?? ReconciliationPriority.NORMAL,
        classId: options.classId ?? undefined,
        fingerprint
      },
      create: {
        type,
        sessionId,
        userId,
        details,
        evidence,
        recommendation,
        priority: options.priority ?? ReconciliationPriority.NORMAL,
        classId: options.classId ?? null,
        fingerprint,
        status: ReconciliationStatus.OPEN
      }
    });
  }
}
