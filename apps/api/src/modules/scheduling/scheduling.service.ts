import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateSessionDto, UpdateSessionScheduleDto } from './scheduling.dto';

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async listSessions(pagination: PaginationQuery, date?: string, teacherId?: string, classId?: string) {
    const where: Record<string, unknown> = {};

    if (date) {
      const day = new Date(date);
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);
      where.startsAt = { gte: start, lte: end };
    }

    if (teacherId) where.teacherId = teacherId;
    if (classId) where.classId = classId;

    const [total, items] = await Promise.all([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        include: {
          schoolClass: true,
          subject: true,
          teacher: { select: { id: true, fullName: true, username: true } }
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

  createSession(payload: CreateSessionDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          classId: payload.classId,
          subjectId: payload.subjectId,
          teacherId: payload.teacherId,
          startsAt: new Date(payload.startsAt),
          endsAt: new Date(payload.endsAt),
          status: SessionStatus.SCHEDULED
        }
      });

      await tx.auditEntry.create({
        data: {
          actorId,
          module: 'scheduling',
          action: 'session.created',
          resource: 'session',
          resourceId: created.id,
          after: created
        }
      });

      return created;
    });
  }

  updateSessionSchedule(sessionId: string, payload: UpdateSessionScheduleDto, actorId: string) {
    const startsAt = new Date(payload.startsAt);
    const endsAt = new Date(payload.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException('Rentang jadwal tidak valid.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.session.findUnique({
        where: { id: sessionId },
        include: {
          schoolClass: { select: { code: true } },
          subject: { select: { name: true } }
        }
      });

      if (!existing) {
        throw new NotFoundException('Sesi tidak ditemukan.');
      }

      if (existing.status !== SessionStatus.SCHEDULED) {
        throw new BadRequestException('Hanya sesi SCHEDULED yang dapat dijadwal ulang.');
      }

      const updated = await tx.session.update({
        where: { id: sessionId },
        data: {
          startsAt,
          endsAt
        },
        include: {
          schoolClass: true,
          subject: true,
          teacher: { select: { id: true, fullName: true, username: true } }
        }
      });

      await tx.auditEntry.create({
        data: {
          actorId,
          module: 'scheduling',
          action: 'session.rescheduled',
          resource: 'session',
          resourceId: sessionId,
          before: {
            startsAt: existing.startsAt,
            endsAt: existing.endsAt,
            classCode: existing.schoolClass.code,
            subjectName: existing.subject.name
          },
          after: {
            startsAt: updated.startsAt,
            endsAt: updated.endsAt,
            classCode: updated.schoolClass.code,
            subjectName: updated.subject.name
          }
        }
      });

      return updated;
    });
  }
}
