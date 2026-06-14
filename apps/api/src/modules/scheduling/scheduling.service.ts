import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { addCalendarDays, businessDateKey, businessDayBounds, businessWeekday, localDateTimeToUtc } from '../../common/business-time';
import type { CreateSessionDto, CreateWeeklyScheduleDto, GenerateSessionsDto, UpdateSessionScheduleDto, UpdateWeeklyScheduleDto } from './scheduling.dto';

function businessDateAsDbDate(value: Date) {
  const { key } = businessDayBounds(value);
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

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

function scheduleConflictCode(error: unknown) {
  const meta = error && typeof error === 'object' && 'meta' in error ? (error as { meta?: unknown }).meta : undefined;
  const text = `${error instanceof Error ? error.message : ''} ${JSON.stringify(meta ?? {})}`;
  if (text.includes('Session_teacher_active_no_overlap_excl')) return 'SESSION_TEACHER_CONFLICT';
  if (text.includes('Session_class_active_no_overlap_excl')) return 'SESSION_CLASS_CONFLICT';
  if (text.includes('Session_room_active_no_overlap_excl')) return 'SESSION_ROOM_CONFLICT';
  if (text.includes('Session_weeklyScheduleId_businessDate_generated_key')) return 'SESSION_GENERATION_DUPLICATE';
  if (text.includes('Session_valid_time_range_chk')) return 'SESSION_INVALID_RANGE';
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'SESSION_GENERATION_DUPLICATE';
  return null;
}

function throwInvalidRange(): never {
  throw new BadRequestException({ code: 'SESSION_INVALID_RANGE', message: 'Rentang jadwal tidak valid.' });
}

function throwScheduleConflict(error: unknown): never {
  const code = scheduleConflictCode(error);
  if (!code) throw error;
  const message = code === 'SESSION_INVALID_RANGE' ? 'Rentang jadwal tidak valid.' : 'Jadwal bentrok dengan sesi aktif lain.';
  if (code === 'SESSION_INVALID_RANGE') throw new BadRequestException({ code, message });
  throw new ConflictException({ code, message });
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
    if (endsAt <= startsAt) throwInvalidRange();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          classId: payload.classId,
          subjectId: payload.subjectId,
          teacherId: payload.teacherId,
          startsAt,
          endsAt,
          businessDate: businessDateAsDbDate(startsAt),
          status: SessionStatus.SCHEDULED
        }
      }).catch(throwScheduleConflict);

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
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.weeklySchedule.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Jadwal mingguan tidak ditemukan.');
      const updated = await tx.weeklySchedule.update({
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
      await writeAudit(tx, { actorId, module: 'scheduling', action: 'weekly_schedule.updated', resource: 'weeklySchedule', resourceId: id, before, after: updated });
      return updated;
    });
  }

  async generateSessionsFromWeeklySchedule(id: string, payload: GenerateSessionsDto, actorId: string) {
    const schedule = await this.prisma.weeklySchedule.findUnique({ where: { id } });
    if (!schedule || !schedule.active) throw new NotFoundException('Jadwal mingguan aktif tidak ditemukan.');
    const from = startOfDay(payload.from);
    const to = startOfDay(payload.to);
    if (to < from) throw new BadRequestException({ code: 'SESSION_INVALID_RANGE', message: 'Tanggal selesai harus setelah tanggal mulai.' });

    const fromKey = businessDateKey(from);
    const toKey = businessDateKey(to);
    const candidates: Array<{ id: string; startsAt: Date; endsAt: Date; businessDate: Date; businessDateKey: string }> = [];
    for (let dayKey = fromKey; dayKey <= toKey; dayKey = addCalendarDays(dayKey, 1)) {
      const day = businessDayBounds(dayKey).date;
      if (dayOfWeek(day) !== schedule.dayOfWeek) continue;
      if (day < schedule.effectiveFrom) continue;
      if (schedule.effectiveTo && day > schedule.effectiveTo) continue;
      const startsAt = combineDateTime(day, schedule.startTime);
      const endsAt = combineDateTime(day, schedule.endTime);
      if (endsAt <= startsAt) throwInvalidRange();
      candidates.push({
        id: randomUUID(),
        startsAt,
        endsAt,
        businessDate: businessDateAsDbDate(startsAt),
        businessDateKey: businessDateKey(startsAt)
      });
    }

    return this.prisma.$transaction(async (tx) => {
      let inserted: Array<{ id: string }> = [];
      if (candidates.length > 0) {
        const now = new Date();
        const values = Prisma.join(candidates.map((candidate) => Prisma.sql`(
          ${candidate.id},
          ${schedule.id},
          ${schedule.classId},
          ${schedule.subjectId},
          ${schedule.teacherId},
          ${schedule.roomId},
          ${candidate.startsAt},
          ${candidate.endsAt},
          ${candidate.businessDateKey}::date,
          ${SessionStatus.SCHEDULED}::"SessionStatus",
          ${now},
          ${now}
        )`));
        inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "Session" (
            "id", "weeklyScheduleId", "classId", "subjectId", "teacherId", "roomId",
            "startsAt", "endsAt", "businessDate", "status", "createdAt", "updatedAt"
          )
          VALUES ${values}
          ON CONFLICT ("weeklyScheduleId", "businessDate") WHERE "weeklyScheduleId" IS NOT NULL DO NOTHING
          RETURNING "id"
        `);
      }

      const canonical = candidates.length === 0
        ? []
        : await tx.session.findMany({
          where: { weeklyScheduleId: schedule.id, businessDate: { in: candidates.map((candidate) => candidate.businessDate) } },
          orderBy: { startsAt: 'asc' }
        });
      const insertedIds = new Set(inserted.map((row) => row.id));
      const generated = canonical.filter((session) => insertedIds.has(session.id));
      const skipped = canonical.filter((session) => !insertedIds.has(session.id));

      await writeAudit(tx, {
        actorId,
        module: 'scheduling',
        action: 'weekly_schedule.sessions_generated',
        resource: 'weeklySchedule',
        resourceId: id,
        after: {
          generatedCount: generated.length,
          skippedCount: skipped.length,
          generatedIds: generated.map((session) => session.id),
          skippedIds: skipped.map((session) => session.id),
          requestedRange: { from: payload.from, to: payload.to },
          scheduleId: id
        }
      });
      return {
        generatedCount: generated.length,
        skippedCount: skipped.length,
        generatedIds: generated.map((session) => session.id),
        skippedIds: skipped.map((session) => session.id),
        requestedRange: { from: payload.from, to: payload.to },
        scheduleId: id,
        items: generated
      };
    }).catch(throwScheduleConflict);
  }

  updateSessionSchedule(sessionId: string, payload: UpdateSessionScheduleDto, actorId: string) {
    const startsAt = parseSchoolDateTime(payload.startsAt);
    const endsAt = parseSchoolDateTime(payload.endsAt);

    if (endsAt <= startsAt) {
      throwInvalidRange();
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
          endsAt,
          businessDate: businessDateAsDbDate(startsAt)
        },
        include: {
          schoolClass: true,
          subject: true,
          teacher: { select: { id: true, fullName: true, username: true } }
        }
      }).catch(throwScheduleConflict);

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
