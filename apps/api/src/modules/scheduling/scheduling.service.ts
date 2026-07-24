import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, SessionStatus, TeacherLeaveStatus, TeacherSessionStatus } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { addCalendarDays, businessDateKey, businessDayBounds, businessWeekday, localDateTimeToUtc } from '../../common/business-time';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { lockScheduleMutationRows } from '../../common/schedule-mutation-lock';
import type {
  CreateSessionDto,
  CreateTeachingAssignmentDto,
  CreateWeeklyScheduleDto,
  GenerateSessionsDto,
  UpdateSessionScheduleDto,
  UpdateTeachingAssignmentDto,
  UpdateWeeklyScheduleDto
} from './scheduling.dto';
import { isDateWithinInclusiveRange, isValidInclusiveDateRange, isValidTimeRange, parseDateOnlyAtUtcMidnight } from './scheduling.validation';
import { lockTeacherLeaveBusinessDate, lockTeacherLeaveBusinessDates, teacherLeaveBusinessDateKey } from './teacher-leave-lock';

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
    return parseDateOnlyAtUtcMidnight(value);
  } catch {
    throw new BadRequestException({ code: 'SCHEDULE_INVALID_DATE', message: 'Tanggal harus format YYYY-MM-DD yang valid.' });
  }
}

function businessDbDate(value: Date | string) {
  if (typeof value === 'string') return dateOnly(value);
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException({ code: 'SCHEDULE_INVALID_DATE', message: 'Tanggal tidak valid.' });
  }
  return dateOnly(businessDateKey(value, 'Asia/Jakarta'));
}

function dateKeyFromUtcMidnight(value: Date) {
  if (Number.isNaN(value.getTime())) throw new BadRequestException({ code: 'SCHEDULE_INVALID_DATE', message: 'Tanggal tidak valid.' });
  return value.toISOString().slice(0, 10);
}

function combineDateTime(day: Date, time: string) {
  return localDateTimeToUtc(dateKeyFromUtcMidnight(day), time);
}

function startOfDay(value: string) {
  return dateOnly(value);
}

function dayOfWeek(date: Date) {
  return businessWeekday(date);
}

function scheduleConflictCode(error: unknown) {
  const meta = error && typeof error === 'object' && 'meta' in error ? (error as { meta?: unknown }).meta : undefined;
  const text = `${error instanceof Error ? error.message : ''} ${JSON.stringify(meta ?? {})}`;
  if (text.includes('TeachingAssignment_active_no_overlap_excl')) return 'TEACHING_ASSIGNMENT_PERIOD_OVERLAP';
  if (text.includes('TeachingAssignment_valid_period_chk')) return 'TEACHING_ASSIGNMENT_INVALID_PERIOD';
  if (text.includes('WeeklySchedule_valid_period_chk')) return 'SCHEDULE_INVALID_PERIOD';
  if (text.includes('Session_teacher_active_no_overlap_excl')) return 'SESSION_TEACHER_CONFLICT';
  if (text.includes('Session_class_active_no_overlap_excl')) return 'SESSION_CLASS_CONFLICT';
  if (text.includes('Session_room_active_no_overlap_excl')) return 'SESSION_ROOM_CONFLICT';
  if (text.includes('Session_weeklyScheduleId_businessDate_generated_key')) return 'SESSION_GENERATION_DUPLICATE';
  if (text.includes('Session_valid_time_range_chk')) return 'SESSION_INVALID_RANGE';
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'SESSION_GENERATION_DUPLICATE';
  return null;
}

function throwScheduleConflict(error: unknown): never {
  const code = scheduleConflictCode(error);
  if (!code) throw error;
  const messages: Record<string, string> = {
    TEACHING_ASSIGNMENT_PERIOD_OVERLAP: 'Periode penugasan guru bertumpang tindih dengan penugasan aktif yang sama.',
    TEACHING_ASSIGNMENT_INVALID_PERIOD: 'Rentang periode penugasan tidak valid.',
    SCHEDULE_INVALID_PERIOD: 'Rentang periode jadwal tidak valid.',
    SESSION_INVALID_RANGE: 'Rentang jadwal tidak valid.'
  };
  if (['TEACHING_ASSIGNMENT_PERIOD_OVERLAP', 'SESSION_TEACHER_CONFLICT', 'SESSION_CLASS_CONFLICT', 'SESSION_ROOM_CONFLICT', 'SESSION_GENERATION_DUPLICATE'].includes(code)) {
    throw new ConflictException({ code, message: messages[code] ?? 'Jadwal bentrok dengan sesi aktif lain.' });
  }
  throw new BadRequestException({ code, message: messages[code] ?? 'Rentang jadwal tidak valid.' });
}

function throwInvalidRange(): never {
  throw new BadRequestException({ code: 'SESSION_INVALID_RANGE', message: 'Rentang jadwal tidak valid.' });
}

function throwSchedulePeriodRequired(): never {
  throw new BadRequestException({ code: 'SCHEDULE_ACADEMIC_PERIOD_REQUIRED', message: 'Tahun ajaran dan semester wajib diisi untuk jadwal baru.' });
}

function throwScheduleAssignmentRequired(): never {
  throw new BadRequestException({ code: 'SCHEDULE_ASSIGNMENT_REQUIRED', message: 'Penugasan mengajar wajib diisi untuk jadwal baru.' });
}

type FormalTeachingAssignment = {
  id: string;
  teacherId: string;
  subjectId: string;
  classId: string;
  academicYearId: string;
  semesterId: string;
  effectiveFrom: Date;
  effectiveTo: Date;
  active: boolean;
};

type SessionActingIdentity = {
  teacherId: string;
  teachingAssignmentId: string;
  substitutionSourceTeacherId: string | null;
  substitutionSourceAssignmentId: string | null;
  leaveApproved: boolean;
};

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTeacher(tx: Prisma.TransactionClient, teacherId: string) {
    const teacher = await tx.user.findUnique({ where: { id: teacherId }, select: { id: true, active: true, role: true } });
    if (!teacher || teacher.role !== Role.GURU_MAPEL || !teacher.active) {
      throw new BadRequestException({ code: 'TEACHING_ASSIGNMENT_TEACHER_INVALID', message: 'Guru pengajar harus akun GURU_MAPEL yang aktif.' });
    }
    return teacher;
  }

  private async resolveCompleteSemester(
    tx: Prisma.TransactionClient,
    academicYearId: string,
    semesterId: string,
    options: { lockAcademicPeriod?: boolean } = {}
  ) {
    // AcademicYear precedes Semester everywhere. This serializes complete
    // period validation with academic-bound changes before assignment reads.
    if (options.lockAcademicPeriod !== false) {
      await lockScheduleMutationRows(tx, { academicYearIds: [academicYearId], semesterIds: [semesterId] });
    }
    const semester = await tx.semester.findUnique({ where: { id: semesterId } });
    if (!semester) {
      throw new BadRequestException({ code: 'SEMESTER_NOT_FOUND', message: 'Semester tidak ditemukan.' });
    }
    if (semester.academicYearId !== academicYearId) {
      throw new BadRequestException({ code: 'SEMESTER_YEAR_MISMATCH', message: 'Semester tidak berada pada tahun ajaran yang dipilih.' });
    }
    if (!semester.startsAt || !semester.endsAt) {
      throw new BadRequestException({ code: 'SEMESTER_BOUNDS_REQUIRED', message: 'Semester wajib memiliki tanggal mulai dan selesai lengkap.' });
    }
    const startsAt = businessDbDate(semester.startsAt);
    const endsAt = businessDbDate(semester.endsAt);
    if (endsAt < startsAt) {
      throw new BadRequestException({ code: 'SEMESTER_INVALID_PERIOD', message: 'Rentang semester tidak valid.' });
    }
    return { ...semester, startsAt, endsAt };
  }

  private assertDateRange(effectiveFrom: Date, effectiveTo: Date | null, code: string, message: string) {
    if (!isValidInclusiveDateRange(effectiveFrom, effectiveTo)) {
      throw new BadRequestException({ code, message });
    }
  }

  private assertWithinSemester(
    effectiveFrom: Date,
    effectiveTo: Date | null,
    semester: { startsAt: Date; endsAt: Date },
    code: string,
    message: string
  ) {
    if (!isDateWithinInclusiveRange(effectiveFrom, semester.startsAt, semester.endsAt)
      || (effectiveTo && !isDateWithinInclusiveRange(effectiveTo, semester.startsAt, semester.endsAt))) {
      throw new BadRequestException({ code, message });
    }
  }

  private async lockWeeklySchedule(tx: Prisma.TransactionClient, weeklyScheduleId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "WeeklySchedule" WHERE "id" = ${weeklyScheduleId} FOR UPDATE`);
  }

  private async validateTeachingAssignmentPayload(
    tx: Prisma.TransactionClient,
    payload: CreateTeachingAssignmentDto | UpdateTeachingAssignmentDto,
    options: { lockAcademicPeriod?: boolean } = {}
  ) {
    const effectiveFrom = dateOnly(payload.effectiveFrom);
    const [semester, schoolClass, subject] = await Promise.all([
      this.resolveCompleteSemester(tx, payload.academicYearId, payload.semesterId, options),
      tx.schoolClass.findUnique({ where: { id: payload.classId }, select: { id: true } }),
      tx.subject.findUnique({ where: { id: payload.subjectId }, select: { id: true } })
    ]);
    await this.assertTeacher(tx, payload.teacherId);
    const effectiveTo = payload.effectiveTo ? dateOnly(payload.effectiveTo) : semester.endsAt;
    this.assertDateRange(effectiveFrom, effectiveTo, 'TEACHING_ASSIGNMENT_INVALID_PERIOD', 'Tanggal selesai penugasan tidak boleh sebelum tanggal mulai.');
    if (!schoolClass || !subject) {
      throw new BadRequestException({ code: 'TEACHING_ASSIGNMENT_REFERENCE_INVALID', message: 'Kelas atau bidang studi tidak ditemukan.' });
    }
    this.assertWithinSemester(
      effectiveFrom,
      effectiveTo,
      semester,
      'TEACHING_ASSIGNMENT_OUTSIDE_ACADEMIC_PERIOD',
      'Periode penugasan harus berada seluruhnya dalam rentang semester.'
    );
    return { effectiveFrom, effectiveTo, semester };
  }

  private async resolveScheduleAssignment(
    tx: Prisma.TransactionClient,
    input: {
      teachingAssignmentId?: string | null;
      academicYearId?: string | null;
      semesterId?: string | null;
      classId: string;
      subjectId: string;
      teacherId: string;
      effectiveFrom: Date;
      effectiveTo: Date | null;
    },
    additionalAssignmentIds: Iterable<string | null | undefined> = [],
    options: { lockAcademicPeriod?: boolean; lockAssignments?: boolean } = {}
  ) {
    if (!input.academicYearId || !input.semesterId) throwSchedulePeriodRequired();
    if (!input.teachingAssignmentId) throwScheduleAssignmentRequired();
    const effectiveFrom = businessDbDate(input.effectiveFrom);
    // Lock semester before assignment. Academic semester updates take this same
    // row lock before inspecting assignment periods.
    const semester = await this.resolveCompleteSemester(tx, input.academicYearId, input.semesterId, options);
    if (options.lockAssignments !== false) {
      await lockScheduleMutationRows(tx, {
        teachingAssignmentIds: [input.teachingAssignmentId, ...additionalAssignmentIds]
      });
    }
    const assignment = await tx.teachingAssignment.findUnique({ where: { id: input.teachingAssignmentId } });
    if (!assignment) throwScheduleAssignmentRequired();
    if (!assignment.active) {
      throw new BadRequestException({ code: 'TEACHING_ASSIGNMENT_INACTIVE', message: 'Penugasan mengajar tidak aktif.' });
    }
    if (
      assignment.classId !== input.classId
      || assignment.subjectId !== input.subjectId
      || assignment.teacherId !== input.teacherId
      || assignment.academicYearId !== input.academicYearId
      || assignment.semesterId !== input.semesterId
    ) {
      throw new BadRequestException({ code: 'TEACHING_ASSIGNMENT_TUPLE_MISMATCH', message: 'Kelas, bidang studi, guru, atau periode tidak sesuai dengan penugasan mengajar.' });
    }

    const [, schoolClass, subject] = await Promise.all([
      this.assertTeacher(tx, assignment.teacherId),
      tx.schoolClass.findUnique({ where: { id: input.classId }, select: { id: true } }),
      tx.subject.findUnique({ where: { id: input.subjectId }, select: { id: true } })
    ]);
    if (!schoolClass || !subject) {
      throw new BadRequestException({ code: 'TEACHING_ASSIGNMENT_REFERENCE_INVALID', message: 'Kelas atau bidang studi tidak ditemukan.' });
    }
    if (!assignment.effectiveTo) {
      throw new BadRequestException({ code: 'TEACHING_ASSIGNMENT_INVALID_PERIOD', message: 'Penugasan mengajar wajib memiliki tanggal selesai.' });
    }
    const assignmentFrom = businessDbDate(assignment.effectiveFrom);
    const assignmentTo = businessDbDate(assignment.effectiveTo);
    const effectiveTo = input.effectiveTo ? businessDbDate(input.effectiveTo) : assignmentTo;
    this.assertDateRange(effectiveFrom, effectiveTo, 'SCHEDULE_INVALID_PERIOD', 'Tanggal selesai jadwal tidak boleh sebelum tanggal mulai.');
    this.assertDateRange(assignmentFrom, assignmentTo, 'TEACHING_ASSIGNMENT_INVALID_PERIOD', 'Rentang periode penugasan tidak valid.');
    this.assertWithinSemester(
      assignmentFrom,
      assignmentTo,
      semester,
      'TEACHING_ASSIGNMENT_OUTSIDE_ACADEMIC_PERIOD',
      'Periode penugasan harus berada seluruhnya dalam rentang semester.'
    );
    if (!isDateWithinInclusiveRange(effectiveFrom, assignmentFrom, assignmentTo)
      || (effectiveTo && !isDateWithinInclusiveRange(effectiveTo, assignmentFrom, assignmentTo))) {
      throw new BadRequestException({ code: 'SCHEDULE_OUTSIDE_TEACHING_ASSIGNMENT', message: 'Periode jadwal harus berada seluruhnya dalam periode penugasan mengajar.' });
    }
    this.assertWithinSemester(
      effectiveFrom,
      effectiveTo,
      semester,
      'SCHEDULE_OUTSIDE_ACADEMIC_PERIOD',
      'Periode jadwal harus berada seluruhnya dalam rentang semester.'
    );
    return { assignment, semester, assignmentFrom, assignmentTo, effectiveFrom, effectiveTo };
  }

  private async getTeachingAssignmentForAdvisoryLock(tx: Prisma.TransactionClient, assignmentId: string) {
    const assignment = await tx.teachingAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throwScheduleAssignmentRequired();
    return assignment;
  }

  private async lockTeachingAssignmentsSorted(tx: Prisma.TransactionClient, assignmentIds: Iterable<string | null | undefined>) {
    await lockScheduleMutationRows(tx, { teachingAssignmentIds: assignmentIds });
  }

  private async findApprovedTeacherLeave(tx: Prisma.TransactionClient, teacherId: string, businessDate: Date) {
    const key = businessDateKey(businessDate);
    const date = new Date(`${key}T00:00:00.000Z`);
    const leaves = await tx.teacherLeave.findMany({
      where: {
        applicantId: teacherId,
        applicantRole: Role.GURU_MAPEL,
        status: TeacherLeaveStatus.APPROVED,
        startDate: { lte: date },
        endDate: { gte: date }
      },
      select: { id: true, substituteTeacherId: true },
      orderBy: { id: 'asc' }
    });
    if (leaves.length > 1) {
      throw new ConflictException({
        code: 'TEACHER_LEAVE_DATE_ALREADY_APPROVED',
        message: 'Sudah ada keterangan guru yang disetujui pada tanggal tersebut.'
      });
    }
    return leaves[0] ?? null;
  }

  /**
   * Discovery only. Caller must acquire all formal/candidate assignment locks in
   * global lexical order, then call revalidateSessionActingIdentity before it
   * writes a Session. Discovery reads never establish mutation authority.
   */
  private async discoverSessionActingIdentity(
    tx: Prisma.TransactionClient,
    formalAssignment: FormalTeachingAssignment,
    businessDate: Date
  ): Promise<SessionActingIdentity> {
    const leave = await this.findApprovedTeacherLeave(tx, formalAssignment.teacherId, businessDate);
    if (!leave?.substituteTeacherId) {
      return {
        teacherId: formalAssignment.teacherId,
        teachingAssignmentId: formalAssignment.id,
        substitutionSourceTeacherId: null,
        substitutionSourceAssignmentId: null,
        leaveApproved: Boolean(leave)
      };
    }

    const substitute = await tx.user.findUnique({
      where: { id: leave.substituteTeacherId },
      select: { id: true, active: true, role: true }
    });
    if (!substitute || !substitute.active || substitute.role !== Role.GURU_MAPEL) {
      throw new ConflictException({
        code: 'TEACHER_LEAVE_SUBSTITUTE_ASSIGNMENT_REQUIRED',
        message: 'Penugasan formal guru pengganti yang aktif wajib tersedia pada tanggal sesi.'
      });
    }

    const candidate = await tx.teachingAssignment.findFirst({
      where: {
        teacherId: substitute.id,
        subjectId: formalAssignment.subjectId,
        classId: formalAssignment.classId,
        academicYearId: formalAssignment.academicYearId,
        semesterId: formalAssignment.semesterId,
        active: true,
        effectiveFrom: { lte: businessDate },
        effectiveTo: { gte: businessDate }
      },
      select: { id: true }
    });
    if (!candidate) {
      throw new ConflictException({
        code: 'TEACHER_LEAVE_SUBSTITUTE_ASSIGNMENT_REQUIRED',
        message: 'Penugasan formal guru pengganti yang aktif wajib tersedia pada tanggal sesi.'
      });
    }

    return {
      teacherId: substitute.id,
      teachingAssignmentId: candidate.id,
      substitutionSourceTeacherId: formalAssignment.teacherId,
      substitutionSourceAssignmentId: formalAssignment.id,
      leaveApproved: true
    };
  }

  private async revalidateSessionActingIdentity(
    tx: Prisma.TransactionClient,
    acting: SessionActingIdentity,
    formalAssignment: FormalTeachingAssignment,
    businessDate: Date
  ): Promise<SessionActingIdentity> {
    if (!acting.substitutionSourceTeacherId) {
      return {
        teacherId: formalAssignment.teacherId,
        teachingAssignmentId: formalAssignment.id,
        substitutionSourceTeacherId: null,
        substitutionSourceAssignmentId: null,
        leaveApproved: acting.leaveApproved
      };
    }
    const lockedCandidate = await this.validateSubstituteAssignment(tx, acting.teachingAssignmentId, acting.teacherId, formalAssignment, businessDate);
    return {
      ...acting,
      teacherId: lockedCandidate.teacherId,
      teachingAssignmentId: lockedCandidate.id,
      substitutionSourceTeacherId: formalAssignment.teacherId,
      substitutionSourceAssignmentId: formalAssignment.id
    };
  }

  private async validateSubstituteAssignment(
    tx: Prisma.TransactionClient,
    assignmentId: string,
    substituteTeacherId: string,
    formalAssignment: FormalTeachingAssignment,
    businessDate: Date
  ) {
    const lockedCandidate = await tx.teachingAssignment.findUnique({ where: { id: assignmentId } });
    if (
      !lockedCandidate
      || !lockedCandidate.active
      || lockedCandidate.teacherId !== substituteTeacherId
      || lockedCandidate.subjectId !== formalAssignment.subjectId
      || lockedCandidate.classId !== formalAssignment.classId
      || lockedCandidate.academicYearId !== formalAssignment.academicYearId
      || lockedCandidate.semesterId !== formalAssignment.semesterId
      || lockedCandidate.effectiveFrom > businessDate
      || lockedCandidate.effectiveTo < businessDate
    ) {
      throw new ConflictException({
        code: 'TEACHER_LEAVE_SUBSTITUTE_ASSIGNMENT_REQUIRED',
        message: 'Penugasan formal guru pengganti yang aktif wajib tersedia pada tanggal sesi.'
      });
    }
    return lockedCandidate;
  }

  private async markFormalTeacherExcused(
    tx: Prisma.TransactionClient,
    sessionId: string,
    teacherId: string
  ) {
    await tx.teacherSessionPresence.upsert({
      where: { sessionId_teacherId: { sessionId, teacherId } },
      update: { status: TeacherSessionStatus.EXCUSED_ABSENCE },
      create: { sessionId, teacherId, status: TeacherSessionStatus.EXCUSED_ABSENCE }
    });
  }

  async listTeachingAssignments(pagination: PaginationQuery) {
    const include = {
      teacher: { select: { id: true, fullName: true, username: true, active: true, role: true } },
      subject: true,
      schoolClass: true,
      academicYear: true,
      semester: true,
      _count: { select: { weeklySchedules: true, sessions: true, substitutionSourceSessions: true } }
    } satisfies Prisma.TeachingAssignmentInclude;
    const [total, items] = await Promise.all([
      this.prisma.teachingAssignment.count(),
      this.prisma.teachingAssignment.findMany({
        include,
        orderBy: [{ active: 'desc' }, { effectiveFrom: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);
    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  async createTeachingAssignment(payload: CreateTeachingAssignmentDto, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockScheduleMutationRows(tx, { userIds: [payload.teacherId] });
        const { effectiveFrom, effectiveTo } = await this.validateTeachingAssignmentPayload(tx, payload);
        const created = await tx.teachingAssignment.create({
          data: {
            teacherId: payload.teacherId,
            subjectId: payload.subjectId,
            classId: payload.classId,
            academicYearId: payload.academicYearId,
            semesterId: payload.semesterId,
            effectiveFrom,
            effectiveTo,
            active: payload.active ?? true
          }
        });
        await writeAudit(tx, { actorId, module: 'scheduling', action: 'teaching_assignment.created', resource: 'teachingAssignment', resourceId: created.id, after: created });
        return created;
      });
    } catch (error) {
      throwScheduleConflict(error);
    }
  }

  async updateTeachingAssignment(id: string, payload: UpdateTeachingAssignmentDto, actorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Every path that needs both rows locks Semester before TeachingAssignment.
        // Reread after acquiring locks detects an assignment that moved semesters.
        const preRead = await tx.teachingAssignment.findUnique({
          where: { id },
          select: { id: true, teacherId: true, academicYearId: true, semesterId: true }
        });
        if (!preRead) throw new NotFoundException('Penugasan mengajar tidak ditemukan.');
        await lockScheduleMutationRows(tx, {
          userIds: [preRead.teacherId, payload.teacherId],
          academicYearIds: [preRead.academicYearId, payload.academicYearId],
          semesterIds: [preRead.semesterId, payload.semesterId],
          teachingAssignmentIds: [id]
        });
        const before = await tx.teachingAssignment.findUnique({
          where: { id },
          include: { _count: { select: { weeklySchedules: true, sessions: true, substitutionSourceSessions: true } } }
        });
        if (!before) throw new NotFoundException('Penugasan mengajar tidak ditemukan.');
        if (before.teacherId !== preRead.teacherId
          || before.academicYearId !== preRead.academicYearId
          || before.semesterId !== preRead.semesterId) {
          throw new ConflictException({ code: 'TEACHING_ASSIGNMENT_STATE_CHANGED', message: 'Penugasan berubah saat diperbarui. Muat ulang lalu coba lagi.' });
        }
        const { effectiveFrom, effectiveTo } = await this.validateTeachingAssignmentPayload(tx, payload, { lockAcademicPeriod: false });
        if (!before.effectiveTo) {
          throw new BadRequestException({ code: 'TEACHING_ASSIGNMENT_INVALID_PERIOD', message: 'Penugasan mengajar wajib memiliki tanggal selesai.' });
        }
        const protectedFieldsChanged = before.teacherId !== payload.teacherId
          || before.subjectId !== payload.subjectId
          || before.classId !== payload.classId
          || before.academicYearId !== payload.academicYearId
          || before.semesterId !== payload.semesterId
          || businessDbDate(before.effectiveFrom).getTime() !== effectiveFrom.getTime()
          || businessDbDate(before.effectiveTo).getTime() !== effectiveTo.getTime();
        if ((before._count.sessions > 0 || before._count.weeklySchedules > 0 || before._count.substitutionSourceSessions > 0) && protectedFieldsChanged) {
          throw new ConflictException({
            code: 'TEACHING_ASSIGNMENT_IMMUTABLE',
            message: 'Penugasan yang sudah dipakai tidak dapat mengubah guru, mapel, kelas, periode, atau tanggal. Buat penugasan baru lalu nonaktifkan penugasan lama.'
          });
        }
        const updated = await tx.teachingAssignment.update({
          where: { id },
          data: {
            teacherId: payload.teacherId,
            subjectId: payload.subjectId,
            classId: payload.classId,
            academicYearId: payload.academicYearId,
            semesterId: payload.semesterId,
            effectiveFrom,
            effectiveTo,
            active: payload.active ?? before.active
          }
        });
        await writeAudit(tx, { actorId, module: 'scheduling', action: 'teaching_assignment.updated', resource: 'teachingAssignment', resourceId: id, before, after: updated });
        return updated;
      });
    } catch (error) {
      throwScheduleConflict(error);
    }
  }

  async listSessions(pagination: PaginationQuery, date?: string, teacherId?: string, classId?: string) {
    const where: Prisma.SessionWhereInput = {};
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
          teachingAssignment: {
            include: {
              academicYear: true,
              semester: true
            }
          },
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
    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  async createSession(payload: CreateSessionDto, actorId: string) {
    const startsAt = parseSchoolDateTime(payload.startsAt);
    const endsAt = parseSchoolDateTime(payload.endsAt);
    if (endsAt <= startsAt) throwInvalidRange();
    const businessDate = businessDateAsDbDate(startsAt);
    if (businessDate.getTime() !== businessDateAsDbDate(endsAt).getTime()) {
      throw new BadRequestException({ code: 'SESSION_CROSS_BUSINESS_DATE_NOT_ALLOWED', message: 'Sesi harus mulai dan selesai pada tanggal bisnis Jakarta yang sama.' });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const formalAssignment = await this.getTeachingAssignmentForAdvisoryLock(tx, payload.teachingAssignmentId);
        await lockTeacherLeaveBusinessDate(tx, formalAssignment.teacherId, businessDate);
        const discoveredActing = await this.discoverSessionActingIdentity(tx, formalAssignment, businessDate);
        const resolved = await this.resolveScheduleAssignment(tx, {
          teachingAssignmentId: payload.teachingAssignmentId,
          academicYearId: payload.academicYearId,
          semesterId: payload.semesterId,
          classId: payload.classId,
          subjectId: payload.subjectId,
          teacherId: payload.teacherId,
          effectiveFrom: businessDate,
          effectiveTo: businessDate
        }, [discoveredActing.teachingAssignmentId]);
        const formalAssignmentAfterLocks = await tx.teachingAssignment.findUnique({ where: { id: payload.teachingAssignmentId } });
        if (!formalAssignmentAfterLocks
          || formalAssignmentAfterLocks.academicYearId !== resolved.assignment.academicYearId
          || formalAssignmentAfterLocks.semesterId !== resolved.assignment.semesterId) {
          throw new ConflictException({ code: 'TEACHING_ASSIGNMENT_STATE_CHANGED', message: 'Penugasan berubah saat sesi dibuat. Muat ulang lalu coba lagi.' });
        }
        const acting = await this.revalidateSessionActingIdentity(tx, discoveredActing, formalAssignmentAfterLocks, businessDate);
        const created = await tx.session.create({
          data: {
            classId: payload.classId,
            subjectId: payload.subjectId,
            teacherId: acting.teacherId,
            teachingAssignmentId: acting.teachingAssignmentId,
            substitutionSourceTeacherId: acting.substitutionSourceTeacherId,
            substitutionSourceAssignmentId: acting.substitutionSourceAssignmentId,
            startsAt,
            endsAt,
            businessDate,
            status: SessionStatus.SCHEDULED
          }
        });
        if (acting.leaveApproved) {
          await this.markFormalTeacherExcused(tx, created.id, resolved.assignment.teacherId);
        }
        await writeAudit(tx, { actorId, module: 'scheduling', action: 'session.created', resource: 'session', resourceId: created.id, after: created });
        return created;
      });
    } catch (error) {
      throwScheduleConflict(error);
    }
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
          teachingAssignment: {
            include: {
              academicYear: true,
              semester: true
            }
          },
          _count: { select: { sessions: true } }
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);
    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  async createWeeklySchedule(payload: CreateWeeklyScheduleDto, actorId: string) {
    const effectiveFrom = dateOnly(payload.effectiveFrom);
    if (!isValidTimeRange(payload.startTime, payload.endTime)) {
      throw new BadRequestException({ code: 'SCHEDULE_INVALID_TIME_RANGE', message: 'Jam selesai harus setelah jam mulai.' });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const resolved = await this.resolveScheduleAssignment(tx, {
          teachingAssignmentId: payload.teachingAssignmentId,
          academicYearId: payload.academicYearId,
          semesterId: payload.semesterId,
          classId: payload.classId,
          subjectId: payload.subjectId,
          teacherId: payload.teacherId,
          effectiveFrom,
          effectiveTo: payload.effectiveTo ? dateOnly(payload.effectiveTo) : null
        });
        const created = await tx.weeklySchedule.create({
          data: {
            classId: payload.classId,
            subjectId: payload.subjectId,
            teacherId: payload.teacherId,
            roomId: payload.roomId || null,
            academicYearId: payload.academicYearId,
            semesterId: payload.semesterId,
            teachingAssignmentId: payload.teachingAssignmentId,
            dayOfWeek: payload.dayOfWeek,
            startTime: payload.startTime,
            endTime: payload.endTime,
            effectiveFrom: resolved.effectiveFrom,
            effectiveTo: resolved.effectiveTo,
            active: payload.active ?? true
          }
        });
        await writeAudit(tx, { actorId, module: 'scheduling', action: 'weekly_schedule.created', resource: 'weeklySchedule', resourceId: created.id, after: created });
        return created;
      });
    } catch (error) {
      throwScheduleConflict(error);
    }
  }

  async updateWeeklySchedule(id: string, payload: UpdateWeeklyScheduleDto, actorId: string) {
    const effectiveFrom = dateOnly(payload.effectiveFrom);
    if (!isValidTimeRange(payload.startTime, payload.endTime)) {
      throw new BadRequestException({ code: 'SCHEDULE_INVALID_TIME_RANGE', message: 'Jam selesai harus setelah jam mulai.' });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockWeeklySchedule(tx, id);
        const before = await tx.weeklySchedule.findUnique({ where: { id } });
        if (!before) throw new NotFoundException('Jadwal mingguan tidak ditemukan.');
        const resolved = await this.resolveScheduleAssignment(tx, {
          teachingAssignmentId: payload.teachingAssignmentId,
          academicYearId: payload.academicYearId,
          semesterId: payload.semesterId,
          classId: payload.classId,
          subjectId: payload.subjectId,
          teacherId: payload.teacherId,
          effectiveFrom,
          effectiveTo: payload.effectiveTo ? dateOnly(payload.effectiveTo) : null
        });
        const updated = await tx.weeklySchedule.update({
          where: { id },
          data: {
            classId: payload.classId,
            subjectId: payload.subjectId,
            teacherId: payload.teacherId,
            roomId: payload.roomId || null,
            academicYearId: payload.academicYearId,
            semesterId: payload.semesterId,
            teachingAssignmentId: payload.teachingAssignmentId,
            dayOfWeek: payload.dayOfWeek,
            startTime: payload.startTime,
            endTime: payload.endTime,
            effectiveFrom: resolved.effectiveFrom,
            effectiveTo: resolved.effectiveTo,
            active: payload.active ?? before.active
          }
        });
        await writeAudit(tx, { actorId, module: 'scheduling', action: 'weekly_schedule.updated', resource: 'weeklySchedule', resourceId: id, before, after: updated });
        return updated;
      });
    } catch (error) {
      throwScheduleConflict(error);
    }
  }

  async generateSessionsFromWeeklySchedule(id: string, payload: GenerateSessionsDto, actorId: string) {
    const from = startOfDay(payload.from);
    const to = startOfDay(payload.to);
    if (to < from) {
      throw new BadRequestException({ code: 'SESSION_INVALID_RANGE', message: 'Tanggal selesai harus setelah tanggal mulai.' });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockWeeklySchedule(tx, id);
        const schedule = await tx.weeklySchedule.findUnique({ where: { id } });
        if (!schedule || !schedule.active) throw new NotFoundException('Jadwal mingguan aktif tidak ditemukan.');
        if (!schedule.academicYearId || !schedule.semesterId) throwSchedulePeriodRequired();
        if (!schedule.teachingAssignmentId) throwScheduleAssignmentRequired();
        if (!isValidTimeRange(schedule.startTime, schedule.endTime)) {
          throw new BadRequestException({ code: 'SCHEDULE_INVALID_TIME_RANGE', message: 'Jam selesai harus setelah jam mulai.' });
        }
        if (!schedule.effectiveTo) {
          throw new BadRequestException({ code: 'SCHEDULE_INVALID_PERIOD', message: 'Jadwal legacy tanpa tanggal selesai tidak dapat menghasilkan sesi baru.' });
        }
        const scheduleFrom = businessDbDate(schedule.effectiveFrom);
        const scheduleTo = businessDbDate(schedule.effectiveTo);
        if (!isDateWithinInclusiveRange(from, scheduleFrom, scheduleTo)
          || !isDateWithinInclusiveRange(to, scheduleFrom, scheduleTo)) {
          throw new BadRequestException({ code: 'SCHEDULE_GENERATION_OUTSIDE_PERIOD', message: 'Rentang pembuatan sesi harus berada dalam jadwal aktif.' });
        }

        const fromKey = dateKeyFromUtcMidnight(from);
        const toKey = dateKeyFromUtcMidnight(to);
        const candidates: Array<{ id: string; startsAt: Date; endsAt: Date; businessDate: Date; businessDateKey: string }> = [];
        for (let dayKey = fromKey; dayKey <= toKey; dayKey = addCalendarDays(dayKey, 1)) {
          const day = dateOnly(dayKey);
          if (!isDateWithinInclusiveRange(day, scheduleFrom, scheduleTo)) {
            throw new BadRequestException({ code: 'SCHEDULE_GENERATION_OUTSIDE_PERIOD', message: 'Tanggal sesi berada di luar jadwal aktif.' });
          }
          if (dayOfWeek(combineDateTime(day, '12:00')) !== schedule.dayOfWeek) continue;
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

        // WeeklySchedule lock is intentionally first: leave review never locks
        // weekly schedules. Teacher/date advisory locks come before AcademicYear,
        // Semester, TeachingAssignment, and Session rows in every shared path.
        await lockTeacherLeaveBusinessDates(tx, candidates.map((candidate) => ({
          teacherId: schedule.teacherId,
          businessDate: candidate.businessDate
        })));
        // Read formal assignment after locking academic rows, but defer its row
        // lock until substitute candidates are known. Locking formal first then
        // candidates could reverse lexical assignment order across generators.
        const preLockResolved = await this.resolveScheduleAssignment(tx, {
          teachingAssignmentId: schedule.teachingAssignmentId,
          academicYearId: schedule.academicYearId,
          semesterId: schedule.semesterId,
          classId: schedule.classId,
          subjectId: schedule.subjectId,
          teacherId: schedule.teacherId,
          effectiveFrom: scheduleFrom,
          effectiveTo: scheduleTo
        }, [], { lockAssignments: false });
        const assignmentFrom = preLockResolved.assignmentFrom;
        const assignmentTo = preLockResolved.assignmentTo;
        if (!isDateWithinInclusiveRange(from, assignmentFrom, assignmentTo)
          || !isDateWithinInclusiveRange(to, assignmentFrom, assignmentTo)
          || !isDateWithinInclusiveRange(from, preLockResolved.semester.startsAt, preLockResolved.semester.endsAt)
          || !isDateWithinInclusiveRange(to, preLockResolved.semester.startsAt, preLockResolved.semester.endsAt)) {
          throw new BadRequestException({ code: 'SCHEDULE_GENERATION_OUTSIDE_PERIOD', message: 'Rentang pembuatan sesi harus berada dalam jadwal, penugasan, dan semester aktif.' });
        }

        // Existing generated sessions stay immutable on retries. Resolve leave
        // substitution only for rows this transaction may insert.
        const existingSessions = candidates.length === 0
          ? []
          : await tx.session.findMany({
            where: { weeklyScheduleId: schedule.id, businessDate: { in: candidates.map((candidate) => candidate.businessDate) } },
            select: { id: true, businessDate: true }
          });
        const existingBusinessDates = new Set(existingSessions.map((session) => dateKeyFromUtcMidnight(session.businessDate)));
        const insertCandidates = candidates.filter((candidate) => !existingBusinessDates.has(candidate.businessDateKey));
        const actingByCandidateId = new Map<string, SessionActingIdentity>();
        for (const candidate of insertCandidates) {
          const acting = await this.discoverSessionActingIdentity(tx, preLockResolved.assignment, candidate.businessDate);
          actingByCandidateId.set(candidate.id, acting);
        }
        const allAssignmentIds = [
          preLockResolved.assignment.id,
          ...[...actingByCandidateId.values()].map((acting) => acting.teachingAssignmentId)
        ];
        await this.lockTeachingAssignmentsSorted(tx, allAssignmentIds);
        // Revalidate formal assignment only after every related assignment row
        // is locked. Repeated locks cover the same rows and cannot reverse order.
        const resolved = await this.resolveScheduleAssignment(tx, {
          teachingAssignmentId: schedule.teachingAssignmentId,
          academicYearId: schedule.academicYearId,
          semesterId: schedule.semesterId,
          classId: schedule.classId,
          subjectId: schedule.subjectId,
          teacherId: schedule.teacherId,
          effectiveFrom: scheduleFrom,
          effectiveTo: scheduleTo
        }, allAssignmentIds, { lockAcademicPeriod: false });
        for (const candidate of insertCandidates) {
          const acting = actingByCandidateId.get(candidate.id)!;
          actingByCandidateId.set(
            candidate.id,
            await this.revalidateSessionActingIdentity(tx, acting, resolved.assignment, candidate.businessDate)
          );
        }

        let inserted: Array<{ id: string }> = [];
        if (insertCandidates.length > 0) {
          const now = new Date();
          const values = Prisma.join(insertCandidates.map((candidate) => {
            const acting = actingByCandidateId.get(candidate.id)!;
            return Prisma.sql`(
              ${candidate.id},
              ${schedule.id},
              ${acting.teachingAssignmentId},
              ${acting.substitutionSourceTeacherId},
              ${acting.substitutionSourceAssignmentId},
              ${schedule.classId},
              ${schedule.subjectId},
              ${acting.teacherId},
              ${schedule.roomId},
              ${candidate.startsAt},
              ${candidate.endsAt},
              ${candidate.businessDateKey}::date,
              ${SessionStatus.SCHEDULED}::"SessionStatus",
              ${now},
              ${now}
            )`;
          }));
          inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            INSERT INTO "Session" (
              "id", "weeklyScheduleId", "teachingAssignmentId", "substitutionSourceTeacherId", "substitutionSourceAssignmentId",
              "classId", "subjectId", "teacherId", "roomId", "startsAt", "endsAt", "businessDate", "status", "createdAt", "updatedAt"
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
        for (const session of generated) {
          const acting = actingByCandidateId.get(session.id);
          if (acting?.leaveApproved) {
            await this.markFormalTeacherExcused(tx, session.id, resolved.assignment.teacherId);
          }
        }
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
      });
    } catch (error) {
      throwScheduleConflict(error);
    }
  }

  async updateSessionSchedule(sessionId: string, payload: UpdateSessionScheduleDto, actorId: string) {
    const startsAt = parseSchoolDateTime(payload.startsAt);
    const endsAt = parseSchoolDateTime(payload.endsAt);
    if (endsAt <= startsAt) throwInvalidRange();
    const businessDate = businessDateAsDbDate(startsAt);
    if (businessDate.getTime() !== businessDateAsDbDate(endsAt).getTime()) {
      throw new BadRequestException({ code: 'SESSION_CROSS_BUSINESS_DATE_NOT_ALLOWED', message: 'Sesi harus mulai dan selesai pada tanggal bisnis Jakarta yang sama.' });
    }

    try {
      const preRead = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          status: true,
          teacherId: true,
          teachingAssignmentId: true,
          substitutionSourceTeacherId: true,
          substitutionSourceAssignmentId: true,
          businessDate: true,
          startsAt: true,
          endsAt: true
        }
      });
      if (!preRead) throw new NotFoundException('Sesi tidak ditemukan.');
      const preReadOriginalTeacherId = preRead.substitutionSourceTeacherId ?? preRead.teacherId;
      const preReadOriginalAssignmentId = preRead.substitutionSourceAssignmentId ?? preRead.teachingAssignmentId;
      if (!preReadOriginalAssignmentId) throwScheduleAssignmentRequired();

      return await this.prisma.$transaction(async (tx) => {
        // Advisory locks precede global academic hierarchy rows. Both source
        // and target date keys serialize leave approval against a date move.
        // Locked reread below rejects any session state changed after pre-read.
        await lockTeacherLeaveBusinessDates(tx, [
          { teacherId: preReadOriginalTeacherId, businessDate: preRead.businessDate },
          { teacherId: preReadOriginalTeacherId, businessDate }
        ]);
        const preReadAssignment = await tx.teachingAssignment.findUnique({ where: { id: preReadOriginalAssignmentId } });
        if (!preReadAssignment) throwScheduleAssignmentRequired();
        const discoveredActing = await this.discoverSessionActingIdentity(tx, preReadAssignment, businessDate);
        await lockScheduleMutationRows(tx, {
          academicYearIds: [preReadAssignment.academicYearId],
          semesterIds: [preReadAssignment.semesterId],
          teachingAssignmentIds: [preReadOriginalAssignmentId, discoveredActing.teachingAssignmentId],
          sessionIds: [sessionId]
        });
        const existing = await tx.session.findUnique({
          where: { id: sessionId },
          include: {
            schoolClass: { select: { code: true } },
            subject: { select: { name: true } },
            teachingAssignment: true,
            substitutionSourceAssignment: true
          }
        });
        if (!existing) throw new NotFoundException('Sesi tidak ditemukan.');
        if (existing.status !== SessionStatus.SCHEDULED) {
          throw new BadRequestException('Hanya sesi SCHEDULED yang dapat dijadwal ulang.');
        }
        const originalTeacherId = existing.substitutionSourceTeacherId ?? existing.teacherId;
        const originalAssignmentId = existing.substitutionSourceAssignmentId ?? existing.teachingAssignmentId;
        if (
          originalTeacherId !== preReadOriginalTeacherId
          || originalAssignmentId !== preReadOriginalAssignmentId
          || existing.teacherId !== preRead.teacherId
          || existing.teachingAssignmentId !== preRead.teachingAssignmentId
          || existing.substitutionSourceTeacherId !== preRead.substitutionSourceTeacherId
          || existing.substitutionSourceAssignmentId !== preRead.substitutionSourceAssignmentId
          || existing.businessDate.getTime() !== preRead.businessDate.getTime()
          || existing.startsAt.getTime() !== preRead.startsAt.getTime()
          || existing.endsAt.getTime() !== preRead.endsAt.getTime()
        ) {
          throw new ConflictException({ code: 'SESSION_STATE_CHANGED', message: 'Sesi berubah saat dijadwal ulang. Muat ulang lalu coba lagi.' });
        }
        if (!originalAssignmentId) throwScheduleAssignmentRequired();
        const originalAssignment = await tx.teachingAssignment.findUnique({ where: { id: originalAssignmentId } });
        if (!originalAssignment
          || originalAssignment.academicYearId !== preReadAssignment.academicYearId
          || originalAssignment.semesterId !== preReadAssignment.semesterId) {
          throw new ConflictException({ code: 'SESSION_STATE_CHANGED', message: 'Penugasan sesi berubah saat dijadwal ulang. Muat ulang lalu coba lagi.' });
        }
        await this.resolveScheduleAssignment(tx, {
          teachingAssignmentId: originalAssignment.id,
          academicYearId: originalAssignment.academicYearId,
          semesterId: originalAssignment.semesterId,
          classId: existing.classId,
          subjectId: existing.subjectId,
          teacherId: originalTeacherId,
          effectiveFrom: businessDate,
          effectiveTo: businessDate
        }, [], { lockAcademicPeriod: false, lockAssignments: false });
        const formalAssignmentAfterLocks = await tx.teachingAssignment.findUnique({ where: { id: originalAssignment.id } });
        if (!formalAssignmentAfterLocks
          || formalAssignmentAfterLocks.academicYearId !== originalAssignment.academicYearId
          || formalAssignmentAfterLocks.semesterId !== originalAssignment.semesterId) {
          throw new ConflictException({ code: 'SESSION_STATE_CHANGED', message: 'Penugasan sesi berubah saat dijadwal ulang. Muat ulang lalu coba lagi.' });
        }
        const acting = await this.revalidateSessionActingIdentity(tx, discoveredActing, formalAssignmentAfterLocks, businessDate);
        if (acting.leaveApproved) {
          await this.markFormalTeacherExcused(tx, existing.id, originalTeacherId);
        } else if (existing.substitutionSourceTeacherId) {
          await tx.teacherSessionPresence.deleteMany({
            where: {
              sessionId: existing.id,
              teacherId: originalTeacherId,
              status: TeacherSessionStatus.EXCUSED_ABSENCE,
              checkInAt: null,
              checkOutAt: null
            }
          });
        }
        const updated = await tx.session.update({
          where: { id: sessionId },
          data: {
            startsAt,
            endsAt,
            businessDate,
            teacherId: acting.teacherId,
            teachingAssignmentId: acting.teachingAssignmentId,
            substitutionSourceTeacherId: acting.substitutionSourceTeacherId,
            substitutionSourceAssignmentId: acting.substitutionSourceAssignmentId
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
    } catch (error) {
      throwScheduleConflict(error);
    }
  }
}
