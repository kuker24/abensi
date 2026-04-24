import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ReconciliationFlagType,
  ReconciliationStatus,
  Role,
  StudentAttendanceStatus,
  TeacherSessionStatus
} from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import type { RequestMeta } from '../../common/request-meta';
import { PrismaService } from '../../prisma/prisma.service';

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
          escalations: {
            where: { status: 'QUEUED' },
            include: {
              createdBy: {
                select: { id: true, fullName: true, role: true }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 1
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
        escalationQueue: item.escalations[0] ?? null
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

  async runPendingReconciliation(actorId?: string) {
    const pendingSessions = await this.prisma.session.findMany({
      where: {
        status: 'CLOSED',
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

    const gateLogs = await this.prisma.gateLog.findMany({
      where: {
        userId: { in: Array.from(involvedUserIds) },
        direction: 'IN',
        tappedAt: {
          gte: dayStart,
          lte: dayEnd
        }
      }
    });

    const hasGateIn = new Set(gateLogs.map((log) => log.userId));
    const attendanceMap = new Map(session.attendances.map((attendance) => [attendance.studentId, attendance]));

    let createdFlags = 0;

    for (const enrollment of session.schoolClass.enrollments) {
      const attendance = attendanceMap.get(enrollment.studentId);
      if (!attendance) continue;

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
    }

    const teacherPresence = session.teacherPresence.find((presence) => presence.teacherId === session.teacherId);
    if (!teacherPresence || teacherPresence.status === TeacherSessionStatus.ALPA_MENGAJAR) {
      await this.createFlag(ReconciliationFlagType.TIDAK_MENGAJAR, session.id, session.teacherId, {
        teacherPresence: teacherPresence?.status ?? null
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
    details: Prisma.InputJsonValue
  ) {
    await this.prisma.reconciliationFlag.upsert({
      where: {
        type_sessionId_userId: {
          type,
          sessionId,
          userId
        }
      },
      update: {
        status: ReconciliationStatus.OPEN,
        details
      },
      create: {
        type,
        sessionId,
        userId,
        details,
        status: ReconciliationStatus.OPEN
      }
    });
  }
}
