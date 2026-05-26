import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateSessionDto, CreateWeeklyScheduleDto, GenerateSessionsDto, UpdateSessionScheduleDto, UpdateWeeklyScheduleDto } from './scheduling.dto';

function combineDateTime(day: Date, time: string) {
  const [hour, minute] = time.split(':').map(Number);
  const value = new Date(day);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function startOfDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Tanggal tidak valid.');
  date.setHours(0, 0, 0, 0);
  return date;
}

function dayOfWeek(date: Date) {
  return date.getDay();
}

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
          teacher: { select: { id: true, fullName: true, username: true } },
          room: { select: { id: true, code: true, name: true } },
          weeklySchedule: { select: { id: true, dayOfWeek: true, startTime: true, endTime: true } },
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

      await writeAudit(tx, {
        actorId,
        module: 'scheduling',
        action: 'session.created',
        resource: 'session',
        resourceId: created.id,
        after: created
      });

      return created;
    });
  }

  async listWeeklySchedules(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.weeklySchedule.count(),
      this.prisma.weeklySchedule.findMany({
        include: {
          schoolClass: true,
          subject: true,
          teacher: { select: { id: true, fullName: true, username: true } },
          room: true,
          academicYear: true,
          semester: true,
          _count: { select: { sessions: true } }
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);
    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  createWeeklySchedule(payload: CreateWeeklyScheduleDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.weeklySchedule.create({
        data: {
          classId: payload.classId,
          subjectId: payload.subjectId,
          teacherId: payload.teacherId,
          roomId: payload.roomId || null,
          academicYearId: payload.academicYearId || null,
          semesterId: payload.semesterId || null,
          dayOfWeek: payload.dayOfWeek,
          startTime: payload.startTime,
          endTime: payload.endTime,
          effectiveFrom: new Date(payload.effectiveFrom),
          effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : null,
          active: payload.active ?? true
        }
      });
      await writeAudit(tx, { actorId, module: 'scheduling', action: 'weekly_schedule.created', resource: 'weeklySchedule', resourceId: created.id, after: created });
      return created;
    });
  }

  async updateWeeklySchedule(id: string, payload: UpdateWeeklyScheduleDto, actorId: string) {
    const before = await this.prisma.weeklySchedule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Jadwal mingguan tidak ditemukan.');
    const updated = await this.prisma.weeklySchedule.update({
      where: { id },
      data: {
        classId: payload.classId,
        subjectId: payload.subjectId,
        teacherId: payload.teacherId,
        roomId: payload.roomId || null,
        academicYearId: payload.academicYearId || null,
        semesterId: payload.semesterId || null,
        dayOfWeek: payload.dayOfWeek,
        startTime: payload.startTime,
        endTime: payload.endTime,
        effectiveFrom: new Date(payload.effectiveFrom),
        effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : null,
        active: payload.active ?? true
      }
    });
    await writeAudit(this.prisma, { actorId, module: 'scheduling', action: 'weekly_schedule.updated', resource: 'weeklySchedule', resourceId: id, before, after: updated });
    return updated;
  }

  async generateSessionsFromWeeklySchedule(id: string, payload: GenerateSessionsDto, actorId: string) {
    const schedule = await this.prisma.weeklySchedule.findUnique({ where: { id } });
    if (!schedule || !schedule.active) throw new NotFoundException('Jadwal mingguan aktif tidak ditemukan.');
    const from = startOfDay(payload.from);
    const to = startOfDay(payload.to);
    if (to < from) throw new BadRequestException('Tanggal selesai harus setelah tanggal mulai.');

    const generated = [];
    const skipped = [];
    for (const day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
      if (dayOfWeek(day) !== schedule.dayOfWeek) continue;
      if (day < schedule.effectiveFrom) continue;
      if (schedule.effectiveTo && day > schedule.effectiveTo) continue;
      const startsAt = combineDateTime(day, schedule.startTime);
      const endsAt = combineDateTime(day, schedule.endTime);
      const existing = await this.prisma.session.findFirst({
        where: {
          OR: [
            { weeklyScheduleId: schedule.id, startsAt },
            { classId: schedule.classId, startsAt, endsAt }
          ]
        }
      });
      if (existing) { skipped.push(existing.id); continue; }
      generated.push(await this.prisma.session.create({
        data: {
          weeklyScheduleId: schedule.id,
          classId: schedule.classId,
          subjectId: schedule.subjectId,
          teacherId: schedule.teacherId,
          roomId: schedule.roomId,
          startsAt,
          endsAt,
          status: SessionStatus.SCHEDULED
        }
      }));
    }

    await writeAudit(this.prisma, { actorId, module: 'scheduling', action: 'weekly_schedule.sessions_generated', resource: 'weeklySchedule', resourceId: id, after: { generated: generated.length, skipped: skipped.length } });
    return { generatedCount: generated.length, skippedCount: skipped.length, items: generated };
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

      await writeAudit(tx, {
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
      });

      return updated;
    });
  }
}
