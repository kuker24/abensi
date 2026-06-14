import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { businessDayBounds, businessWeekday, localDateTimeToUtc } from '../../common/business-time';
import type { CreateSessionDto, CreateWeeklyScheduleDto, GenerateSessionsDto, UpdateSessionScheduleDto, UpdateWeeklyScheduleDto } from './scheduling.dto';

function parseSchoolDateTime(value: string) {
  const localMatch = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?)?$/.exec(value);
  if (localMatch) {
    return localDateTimeToUtc(localMatch[1], localMatch[2] ?? '00:00');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Tanggal dan jam tidak valid.');
  return parsed;
}

function dateOnly(value: string) {
  try {
    return businessDayBounds(value).date;
  } catch {
    throw new BadRequestException('Tanggal tidak valid.');
  }
}

function combineDateTime(day: Date, time: string) {
  return localDateTimeToUtc(businessDayBounds(day).key, time);
}

function startOfDay(value: string) {
  try {
    return businessDayBounds(value).date;
  } catch {
    throw new BadRequestException('Tanggal tidak valid.');
  }
}

function dayOfWeek(date: Date) {
  return businessWeekday(date);
}

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async listSessions(pagination: PaginationQuery, date?: string, teacherId?: string, classId?: string) {
    const where: Record<string, unknown> = {};

    if (date) {
      try {
        const { start, end } = businessDayBounds(date);
        where.startsAt = { gte: start, lte: end };
      } catch {
        throw new BadRequestException('Tanggal tidak valid.');
      }
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
    const startsAt = parseSchoolDateTime(payload.startsAt);
    const endsAt = parseSchoolDateTime(payload.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('Rentang jadwal tidak valid.');

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          classId: payload.classId,
          subjectId: payload.subjectId,
          teacherId: payload.teacherId,
          startsAt,
          endsAt,
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
          effectiveFrom: dateOnly(payload.effectiveFrom),
          effectiveTo: payload.effectiveTo ? dateOnly(payload.effectiveTo) : null,
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
        effectiveFrom: dateOnly(payload.effectiveFrom),
        effectiveTo: payload.effectiveTo ? dateOnly(payload.effectiveTo) : null,
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
    for (let day = new Date(from); day <= to; day = new Date(day.getTime() + 24 * 60 * 60 * 1000)) {
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
    const startsAt = parseSchoolDateTime(payload.startsAt);
    const endsAt = parseSchoolDateTime(payload.endsAt);

    if (endsAt <= startsAt) {
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
