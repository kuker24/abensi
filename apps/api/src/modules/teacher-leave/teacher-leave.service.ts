import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  GateDirection,
  NotificationType,
  Prisma,
  Role,
  SessionStatus,
  TeacherLeaveStatus,
  TeacherSessionStatus
} from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { addCalendarDays, assertBusinessDateKey, businessDateKey, businessDayBounds } from '../../common/business-time';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { lockScheduleMutationRows } from '../../common/schedule-mutation-lock';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { lockTeacherLeaveBusinessDates } from '../scheduling/teacher-leave-lock';
import { CancelTeacherLeaveDto, CreateTeacherLeaveDto, ReviewTeacherLeaveDto, RevokeTeacherLeaveDto } from './teacher-leave.dto';

const APPLICANT_ROLES = new Set<Role>([
  Role.ADMIN_TU,
  Role.KEPALA_SEKOLAH,
  Role.GURU_MAPEL,
  Role.GURU_PIKET,
  Role.OPERATOR_IT
]);

const ACTIVE_STATUSES = [TeacherLeaveStatus.PENDING, TeacherLeaveStatus.APPROVED];

const PERSON_SELECT = { id: true, fullName: true, role: true } as const;

const LEAVE_SELECT = {
  id: true,
  applicantId: true,
  applicantRole: true,
  startDate: true,
  endDate: true,
  type: true,
  status: true,
  reason: true,
  decisionNote: true,
  reviewedById: true,
  reviewedAt: true,
  substituteTeacherId: true,
  cancelledById: true,
  cancelledAt: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  applicant: { select: PERSON_SELECT },
  reviewedBy: { select: PERSON_SELECT },
  substituteTeacher: { select: PERSON_SELECT },
  cancelledBy: { select: PERSON_SELECT }
} satisfies Prisma.TeacherLeaveSelect;

type LeaveRecord = Prisma.TeacherLeaveGetPayload<{ select: typeof LEAVE_SELECT }>;

function leaveAuditSnapshot(leave: LeaveRecord) {
  return {
    id: leave.id,
    applicantId: leave.applicantId,
    applicantRole: leave.applicantRole,
    startDate: leave.startDate,
    endDate: leave.endDate,
    type: leave.type,
    status: leave.status,
    decisionNote: leave.decisionNote,
    reviewedById: leave.reviewedById,
    reviewedAt: leave.reviewedAt,
    substituteTeacherId: leave.substituteTeacherId,
    cancelledById: leave.cancelledById,
    cancelledAt: leave.cancelledAt,
    cancellationReason: leave.cancellationReason
  };
}

function parseDate(value: string) {
  try {
    assertBusinessDateKey(value);
    return new Date(`${value}T00:00:00.000Z`);
  } catch {
    throw new BadRequestException('Tanggal wajib valid dengan format YYYY-MM-DD.');
  }
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function rangeDateKeys(startDate: Date, endDate: Date) {
  const result: string[] = [];
  for (let current = dateKey(startDate); current <= dateKey(endDate); current = addCalendarDays(current, 1)) {
    result.push(current);
  }
  return result;
}

function requiredText(value: string | undefined, message: string) {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException(message);
  return normalized;
}

function applicantHref(role: Role) {
  return role === Role.GURU_MAPEL ? '/guru/izin' : '/admin/izin-saya';
}

@Injectable()
export class TeacherLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  private assertApplicant(actor: { role: Role }) {
    if (actor.role === Role.SISWA || actor.role === Role.DEVELOPER || !APPLICANT_ROLES.has(actor.role)) {
      throw new ForbiddenException('Peran ini tidak dapat mengelola pengajuan izin pegawai.');
    }
  }

  private reviewableRoles(actor: { role: Role }): Role[] {
    if (actor.role === Role.ADMIN_TU) {
      return [Role.KEPALA_SEKOLAH, Role.GURU_MAPEL, Role.GURU_PIKET, Role.OPERATOR_IT];
    }
    if (actor.role === Role.KEPALA_SEKOLAH) return [Role.ADMIN_TU];
    throw new ForbiddenException('Peran ini tidak dapat meninjau pengajuan izin pegawai.');
  }

  private assertCanReview(actor: { sub: string; role: Role }, leave: Pick<LeaveRecord, 'applicantId' | 'applicantRole'>) {
    const roles = this.reviewableRoles(actor);
    if (actor.sub === leave.applicantId) throw new ForbiddenException('Pengajuan sendiri tidak dapat ditinjau.');
    if (!roles.includes(leave.applicantRole)) throw new ForbiddenException('Pengajuan ini berada di luar kewenangan peninjau.');
  }

  private validateRange(start: string, end: string) {
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (end < start) throw new BadRequestException('Tanggal selesai tidak boleh sebelum tanggal mulai.');

    const today = businessDateKey();
    if (start < addCalendarDays(today, -7)) throw new BadRequestException('Tanggal mulai paling lama 7 hari kalender sebelum hari ini.');
    if (start > addCalendarDays(today, 90)) throw new BadRequestException('Tanggal mulai paling jauh 90 hari kalender dari hari ini.');

    const dates = rangeDateKeys(startDate, endDate);
    if (dates.length > 30) throw new BadRequestException('Durasi izin maksimal 30 hari kalender inklusif.');
    return { startDate, endDate, dates };
  }

  private validateStatusFilter(status?: TeacherLeaveStatus) {
    if (status && !Object.values(TeacherLeaveStatus).includes(status)) {
      throw new BadRequestException('Status pengajuan tidak valid.');
    }
  }

  private async lockLeave(tx: Prisma.TransactionClient, leaveId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TeacherLeave" WHERE "id" = ${leaveId} FOR UPDATE`);
  }

  private async lockRange(tx: Prisma.TransactionClient, applicantId: string, startDate: Date, endDate: Date) {
    await lockTeacherLeaveBusinessDates(tx, rangeDateKeys(startDate, endDate).map((businessDate) => ({
      teacherId: applicantId,
      businessDate
    })));
  }

  private async findActiveOverlap(
    tx: Prisma.TransactionClient,
    applicantId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string
  ) {
    return tx.teacherLeave.findFirst({
      where: {
        applicantId,
        status: { in: ACTIVE_STATUSES },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      select: { id: true }
    });
  }

  private activeOverlap(): never {
    throw new ConflictException({
      code: 'PERSONNEL_LEAVE_DATE_OVERLAP',
      message: 'Sudah ada pengajuan aktif yang beririsan dengan rentang tanggal tersebut.'
    });
  }

  async listMine(user: { sub: string; role: Role }, pagination: PaginationQuery, status?: TeacherLeaveStatus) {
    this.assertApplicant(user);
    this.validateStatusFilter(status);
    const where: Prisma.TeacherLeaveWhereInput = { applicantId: user.sub, ...(status ? { status } : {}) };
    const [total, items] = await Promise.all([
      this.prisma.teacherLeave.count({ where }),
      this.prisma.teacherLeave.findMany({ where, select: LEAVE_SELECT, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.limit })
    ]);
    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  async listForReview(user: { sub: string; role: Role }, pagination: PaginationQuery, status?: TeacherLeaveStatus) {
    const applicantRoles = this.reviewableRoles(user);
    this.validateStatusFilter(status);
    const where: Prisma.TeacherLeaveWhereInput = {
      applicantRole: { in: applicantRoles },
      applicantId: { not: user.sub },
      ...(status ? { status } : {})
    };
    const [total, items] = await Promise.all([
      this.prisma.teacherLeave.count({ where }),
      this.prisma.teacherLeave.findMany({ where, select: LEAVE_SELECT, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.limit })
    ]);
    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  async create(user: { sub: string; role: Role }, payload: CreateTeacherLeaveDto) {
    this.assertApplicant(user);
    const reason = requiredText(payload.reason, 'Alasan wajib diisi.');
    if (reason.length < 10 || reason.length > 2000) throw new BadRequestException('Alasan harus 10 sampai 2000 karakter.');
    const { startDate, endDate } = this.validateRange(payload.startDate, payload.endDate);

    const leave = await this.prisma.$transaction(async (tx) => {
      await this.lockRange(tx, user.sub, startDate, endDate);
      if (await this.findActiveOverlap(tx, user.sub, startDate, endDate)) this.activeOverlap();

      const created = await tx.teacherLeave.create({
        data: {
          applicantId: user.sub,
          applicantRole: user.role,
          startDate,
          endDate,
          type: payload.type,
          reason
        },
        select: LEAVE_SELECT
      });
      await writeAudit(tx, {
        actorId: user.sub,
        actorRole: user.role,
        module: 'teacher-leave',
        action: 'personnel_leave.submitted',
        resource: 'teacherLeave',
        resourceId: created.id,
        reason,
        after: leaveAuditSnapshot(created)
      });
      return created;
    });

    await this.notifications.notifyRoles(user.role === Role.ADMIN_TU ? [Role.KEPALA_SEKOLAH] : [Role.ADMIN_TU], {
      type: NotificationType.LEAVE_SUBMITTED,
      title: 'Pengajuan izin pegawai masuk',
      body: `${leave.applicant.fullName} mengajukan ${payload.type}.`,
      href: '/admin/teacher-leaves'
    });
    return leave;
  }

  async cancel(id: string, actor: { sub: string; role: Role }, payload: CancelTeacherLeaveDto) {
    this.assertApplicant(actor);
    const cancellationReason = payload.cancellationReason?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      await this.lockLeave(tx, id);
      const existing = await tx.teacherLeave.findUnique({ where: { id }, select: LEAVE_SELECT });
      if (!existing) throw new NotFoundException('Pengajuan tidak ditemukan.');
      if (existing.applicantId !== actor.sub) throw new ForbiddenException('Hanya pemilik yang dapat membatalkan pengajuan.');
      if (existing.status !== TeacherLeaveStatus.PENDING) throw new ConflictException('Hanya pengajuan PENDING yang dapat dibatalkan.');
      await this.lockRange(tx, existing.applicantId, existing.startDate, existing.endDate);

      const updated = await tx.teacherLeave.update({
        where: { id },
        data: {
          status: TeacherLeaveStatus.CANCELLED,
          cancelledById: actor.sub,
          cancelledAt: new Date(),
          cancellationReason
        },
        select: LEAVE_SELECT
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'teacher-leave',
        action: 'personnel_leave.cancelled',
        resource: 'teacherLeave',
        resourceId: id,
        reason: cancellationReason,
        before: leaveAuditSnapshot(existing),
        after: leaveAuditSnapshot(updated)
      });
      return updated;
    });
  }

  private substituteAssignmentRequired(): never {
    throw new ConflictException({
      code: 'TEACHER_LEAVE_SUBSTITUTE_ASSIGNMENT_REQUIRED',
      message: 'Buat penugasan mengajar formal pengganti terlebih dahulu sebelum menyetujui izin guru.'
    });
  }

  private substituteTeacherInvalid(): never {
    throw new BadRequestException({
      code: 'TEACHER_LEAVE_SUBSTITUTE_TEACHER_INVALID',
      message: 'Guru pengganti harus akun GURU_MAPEL yang aktif.'
    });
  }

  private sessionStateChanged(): never {
    throw new ConflictException({
      code: 'TEACHER_LEAVE_SESSION_STATE_CHANGED',
      message: 'Status sesi berubah saat izin diproses. Muat ulang lalu coba lagi.'
    });
  }

  private revokeUnsafe(): never {
    throw new ConflictException({
      code: 'TEACHER_LEAVE_REVOKE_UNSAFE',
      message: 'Izin tidak dapat dicabut karena presensi atau sesi pengganti sudah berubah.'
    });
  }

  private async assertNoAttendanceConflict(tx: Prisma.TransactionClient, leave: LeaveRecord) {
    const [gateIn, teacherCheckIn] = await Promise.all([
      tx.gateLog.findFirst({
        where: {
          userId: leave.applicantId,
          direction: GateDirection.IN,
          businessDate: { gte: leave.startDate, lte: leave.endDate }
        },
        select: { id: true }
      }),
      tx.teacherSessionPresence.findFirst({
        where: {
          teacherId: leave.applicantId,
          checkInAt: { not: null },
          session: { businessDate: { gte: leave.startDate, lte: leave.endDate } }
        },
        select: { id: true }
      })
    ]);
    if (gateIn || teacherCheckIn) {
      throw new ConflictException({
        code: 'PERSONNEL_LEAVE_ATTENDANCE_CONFLICT',
        message: 'Izin tidak dapat disetujui karena kehadiran sudah tercatat pada rentang tanggal.'
      });
    }
  }

  private async approveTeacherSessions(
    tx: Prisma.TransactionClient,
    existing: LeaveRecord,
    substituteTeacherId?: string
  ) {
    if (substituteTeacherId) {
      await lockScheduleMutationRows(tx, { userIds: [substituteTeacherId] });
      const substitute = await tx.user.findUnique({
        where: { id: substituteTeacherId },
        select: { id: true, active: true, role: true }
      });
      if (!substitute || !substitute.active || substitute.role !== Role.GURU_MAPEL) this.substituteTeacherInvalid();
    }

    const sessions = await tx.session.findMany({
      where: {
        OR: [
          { teacherId: existing.applicantId },
          { substitutionSourceTeacherId: existing.applicantId }
        ],
        businessDate: { gte: existing.startDate, lte: existing.endDate },
        status: { in: [SessionStatus.SCHEDULED, SessionStatus.MISSED] }
      },
      select: {
        id: true,
        teacherId: true,
        substitutionSourceTeacherId: true,
        classId: true,
        subjectId: true,
        businessDate: true,
        startsAt: true,
        endsAt: true,
        status: true,
        teachingAssignmentId: true,
        substitutionSourceAssignmentId: true,
        teachingAssignment: { select: { academicYearId: true, semesterId: true } },
        substitutionSourceAssignment: { select: { academicYearId: true, semesterId: true } }
      },
      orderBy: { id: 'asc' }
    });
    const substituteAssignments = new Map<string, string>();

    if (substituteTeacherId) {
      const scheduled = sessions.filter((session) => session.status === SessionStatus.SCHEDULED);
      const sourceIds = scheduled.map((session) => session.substitutionSourceAssignmentId ?? session.teachingAssignmentId);
      if (sourceIds.some((assignmentId) => !assignmentId)) this.substituteAssignmentRequired();
      const sourceAssignments = sourceIds.length === 0 ? [] : await tx.teachingAssignment.findMany({
        where: { id: { in: sourceIds.filter((assignmentId): assignmentId is string => Boolean(assignmentId)) } },
        select: { id: true, academicYearId: true, semesterId: true },
        orderBy: { id: 'asc' }
      });
      const sourceById = new Map(sourceAssignments.map((assignment) => [assignment.id, assignment]));
      if (sourceById.size !== new Set(sourceIds).size) this.substituteAssignmentRequired();

      for (const session of scheduled) {
        const sourceId = session.substitutionSourceAssignmentId ?? session.teachingAssignmentId;
        const source = sourceId ? sourceById.get(sourceId) : null;
        if (!source) this.substituteAssignmentRequired();
        const candidate = await tx.teachingAssignment.findFirst({
          where: {
            teacherId: substituteTeacherId,
            classId: session.classId,
            subjectId: session.subjectId,
            academicYearId: source.academicYearId,
            semesterId: source.semesterId,
            active: true,
            effectiveFrom: { lte: session.businessDate },
            effectiveTo: { gte: session.businessDate }
          },
          select: { id: true },
          orderBy: { id: 'asc' }
        });
        if (!candidate) this.substituteAssignmentRequired();
        substituteAssignments.set(session.id, candidate.id);
      }

      await lockScheduleMutationRows(tx, {
        academicYearIds: [
          ...sessions.map((session) => session.substitutionSourceAssignment?.academicYearId ?? session.teachingAssignment?.academicYearId),
          ...sourceAssignments.map((assignment) => assignment.academicYearId)
        ],
        semesterIds: [
          ...sessions.map((session) => session.substitutionSourceAssignment?.semesterId ?? session.teachingAssignment?.semesterId),
          ...sourceAssignments.map((assignment) => assignment.semesterId)
        ],
        teachingAssignmentIds: [
          ...sourceIds.filter((assignmentId): assignmentId is string => Boolean(assignmentId)),
          ...substituteAssignments.values()
        ],
        sessionIds: scheduled.map((session) => session.id)
      });

      const lockedSessions = await tx.session.findMany({
        where: { id: { in: scheduled.map((session) => session.id) } },
        select: {
          id: true,
          teacherId: true,
          classId: true,
          subjectId: true,
          businessDate: true,
          startsAt: true,
          endsAt: true,
          status: true,
          teachingAssignmentId: true,
          substitutionSourceTeacherId: true,
          substitutionSourceAssignmentId: true
        },
        orderBy: { id: 'asc' }
      });
      const lockedById = new Map(lockedSessions.map((session) => [session.id, session]));
      for (const session of scheduled) {
        const locked = lockedById.get(session.id);
        if (
          !locked
          || locked.status !== SessionStatus.SCHEDULED
          || locked.teacherId !== session.teacherId
          || locked.teachingAssignmentId !== session.teachingAssignmentId
          || locked.substitutionSourceTeacherId !== session.substitutionSourceTeacherId
          || locked.substitutionSourceAssignmentId !== session.substitutionSourceAssignmentId
          || locked.businessDate.getTime() !== session.businessDate.getTime()
          || locked.startsAt.getTime() !== session.startsAt.getTime()
          || locked.endsAt.getTime() !== session.endsAt.getTime()
          || (locked.substitutionSourceTeacherId && locked.substitutionSourceTeacherId !== existing.applicantId)
        ) this.sessionStateChanged();
      }

      const allAssignmentIds = [...new Set([...sourceIds.filter((assignmentId): assignmentId is string => Boolean(assignmentId)), ...substituteAssignments.values()])];
      const lockedAssignments = await tx.teachingAssignment.findMany({
        where: { id: { in: allAssignmentIds } },
        select: {
          id: true,
          teacherId: true,
          classId: true,
          subjectId: true,
          academicYearId: true,
          semesterId: true,
          active: true,
          effectiveFrom: true,
          effectiveTo: true
        },
        orderBy: { id: 'asc' }
      });
      const lockedAssignmentsById = new Map(lockedAssignments.map((assignment) => [assignment.id, assignment]));

      for (const session of scheduled) {
        const locked = lockedById.get(session.id)!;
        const sourceAssignmentId = locked.substitutionSourceAssignmentId ?? locked.teachingAssignmentId;
        const candidateId = substituteAssignments.get(session.id)!;
        const assignment = lockedAssignmentsById.get(candidateId);
        const formalAssignment = sourceAssignmentId ? lockedAssignmentsById.get(sourceAssignmentId) : null;
        if (
          !assignment
          || !formalAssignment
          || !assignment.active
          || assignment.teacherId !== substituteTeacherId
          || assignment.classId !== locked.classId
          || assignment.subjectId !== locked.subjectId
          || assignment.academicYearId !== formalAssignment.academicYearId
          || assignment.semesterId !== formalAssignment.semesterId
          || assignment.effectiveFrom > locked.businessDate
          || assignment.effectiveTo < locked.businessDate
        ) this.substituteAssignmentRequired();
      }
    }

    for (const session of sessions) {
      await tx.teacherSessionPresence.upsert({
        where: { sessionId_teacherId: { sessionId: session.id, teacherId: existing.applicantId } },
        update: { status: TeacherSessionStatus.EXCUSED_ABSENCE },
        create: { sessionId: session.id, teacherId: existing.applicantId, status: TeacherSessionStatus.EXCUSED_ABSENCE }
      });
      const substituteAssignmentId = substituteAssignments.get(session.id);
      if (substituteAssignmentId) {
        const swapped = await tx.session.updateMany({
          where: {
            id: session.id,
            status: SessionStatus.SCHEDULED,
            teacherId: session.teacherId,
            teachingAssignmentId: session.teachingAssignmentId,
            substitutionSourceTeacherId: session.substitutionSourceTeacherId,
            substitutionSourceAssignmentId: session.substitutionSourceAssignmentId,
            businessDate: session.businessDate
          },
          data: {
            teacherId: substituteTeacherId!,
            teachingAssignmentId: substituteAssignmentId,
            substitutionSourceTeacherId: existing.applicantId,
            substitutionSourceAssignmentId: session.substitutionSourceAssignmentId ?? session.teachingAssignmentId
          }
        });
        if (swapped.count !== 1) this.sessionStateChanged();
      }
    }
  }

  async review(id: string, actor: { sub: string; role: Role }, payload: ReviewTeacherLeaveDto) {
    if (payload.status !== TeacherLeaveStatus.APPROVED && payload.status !== TeacherLeaveStatus.REJECTED) {
      throw new BadRequestException('Status review hanya boleh APPROVED atau REJECTED.');
    }
    const decisionNote = payload.decisionNote?.trim() || null;
    if (payload.status === TeacherLeaveStatus.REJECTED && !decisionNote) {
      throw new BadRequestException('Catatan keputusan wajib diisi untuk penolakan.');
    }
    if (payload.status !== TeacherLeaveStatus.APPROVED && payload.substituteTeacherId) {
      throw new BadRequestException('Guru pengganti hanya dapat diisi untuk persetujuan.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockLeave(tx, id);
      const existing = await tx.teacherLeave.findUnique({ where: { id }, select: LEAVE_SELECT });
      if (!existing) throw new NotFoundException('Pengajuan tidak ditemukan.');
      this.assertCanReview(actor, existing);
      if (existing.status !== TeacherLeaveStatus.PENDING) {
        throw new ConflictException({ code: 'TEACHER_LEAVE_ALREADY_REVIEWED', message: 'Pengajuan sudah ditinjau.' });
      }
      if (existing.applicantRole !== Role.GURU_MAPEL && payload.substituteTeacherId) {
        throw new BadRequestException('Guru pengganti hanya berlaku untuk pemohon GURU_MAPEL.');
      }
      if (payload.substituteTeacherId === existing.applicantId) {
        throw new BadRequestException({
          code: 'TEACHER_LEAVE_SUBSTITUTE_SELF_NOT_ALLOWED',
          message: 'Guru pengganti tidak boleh sama dengan pemohon.'
        });
      }

      await this.lockRange(tx, existing.applicantId, existing.startDate, existing.endDate);
      if (payload.status === TeacherLeaveStatus.APPROVED) {
        if (await this.findActiveOverlap(tx, existing.applicantId, existing.startDate, existing.endDate, id)) this.activeOverlap();
        await this.assertNoAttendanceConflict(tx, existing);
        if (existing.applicantRole === Role.GURU_MAPEL) {
          await this.approveTeacherSessions(tx, existing, payload.substituteTeacherId);
        }
      }

      const updated = await tx.teacherLeave.update({
        where: { id },
        data: {
          status: payload.status,
          decisionNote,
          reviewedById: actor.sub,
          reviewedAt: new Date(),
          substituteTeacherId: payload.status === TeacherLeaveStatus.APPROVED ? payload.substituteTeacherId || null : null
        },
        select: LEAVE_SELECT
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'teacher-leave',
        action: payload.status === TeacherLeaveStatus.APPROVED ? 'personnel_leave.approved' : 'personnel_leave.rejected',
        resource: 'teacherLeave',
        resourceId: id,
        reason: decisionNote,
        before: leaveAuditSnapshot(existing),
        after: leaveAuditSnapshot(updated)
      });
      await tx.notification.create({
        data: {
          userId: existing.applicantId,
          type: payload.status === TeacherLeaveStatus.APPROVED ? NotificationType.LEAVE_APPROVED : NotificationType.LEAVE_REJECTED,
          title: payload.status === TeacherLeaveStatus.APPROVED ? 'Pengajuan disetujui' : 'Pengajuan ditolak',
          body: decisionNote || `Status pengajuan Anda: ${payload.status}`,
          href: applicantHref(existing.applicantRole)
        }
      });
      return updated;
    });
  }

  private async rollbackTeacherApproval(tx: Prisma.TransactionClient, existing: LeaveRecord) {
    const sessions = await tx.session.findMany({
      where: {
        businessDate: { gte: existing.startDate, lte: existing.endDate },
        OR: [
          { teacherId: existing.applicantId },
          { substitutionSourceTeacherId: existing.applicantId },
          { teacherPresence: { some: { teacherId: existing.applicantId } } }
        ]
      },
      select: {
        id: true,
        teacherId: true,
        teachingAssignmentId: true,
        substitutionSourceTeacherId: true,
        substitutionSourceAssignmentId: true,
        businessDate: true,
        status: true,
        teacherPresence: {
          where: { teacherId: existing.applicantId },
          select: {
            id: true,
            status: true,
            checkInAt: true,
            checkOutAt: true,
            checkInById: true,
            checkOutById: true
          }
        }
      },
      orderBy: { id: 'asc' }
    });

    for (const session of sessions) {
      const substituted = session.substitutionSourceTeacherId === existing.applicantId;
      if (substituted && (
        !existing.substituteTeacherId
        || session.teacherId !== existing.substituteTeacherId
        || !session.substitutionSourceAssignmentId
        || session.status !== SessionStatus.SCHEDULED
      )) this.revokeUnsafe();
      for (const presence of session.teacherPresence) {
        if (
          presence.status !== TeacherSessionStatus.EXCUSED_ABSENCE
          || presence.checkInAt
          || presence.checkOutAt
          || presence.checkInById
          || presence.checkOutById
        ) this.revokeUnsafe();
      }
    }

    await lockScheduleMutationRows(tx, {
      teachingAssignmentIds: sessions.flatMap((session) => [session.teachingAssignmentId, session.substitutionSourceAssignmentId]),
      sessionIds: sessions.map((session) => session.id)
    });
    const locked = await tx.session.findMany({
      where: { id: { in: sessions.map((session) => session.id) } },
      select: {
        id: true,
        teacherId: true,
        teachingAssignmentId: true,
        substitutionSourceTeacherId: true,
        substitutionSourceAssignmentId: true,
        businessDate: true,
        status: true
      },
      orderBy: { id: 'asc' }
    });
    const lockedById = new Map(locked.map((session) => [session.id, session]));
    for (const session of sessions) {
      const current = lockedById.get(session.id);
      if (
        !current
        || current.teacherId !== session.teacherId
        || current.teachingAssignmentId !== session.teachingAssignmentId
        || current.substitutionSourceTeacherId !== session.substitutionSourceTeacherId
        || current.substitutionSourceAssignmentId !== session.substitutionSourceAssignmentId
        || current.businessDate.getTime() !== session.businessDate.getTime()
        || current.status !== session.status
      ) this.revokeUnsafe();
    }

    for (const session of sessions) {
      for (const presence of session.teacherPresence) {
        const deleted = await tx.teacherSessionPresence.deleteMany({
          where: {
            id: presence.id,
            teacherId: existing.applicantId,
            status: TeacherSessionStatus.EXCUSED_ABSENCE,
            checkInAt: null,
            checkOutAt: null,
            checkInById: null,
            checkOutById: null
          }
        });
        if (deleted.count !== 1) this.revokeUnsafe();
      }
      if (session.substitutionSourceTeacherId === existing.applicantId) {
        const restored = await tx.session.updateMany({
          where: {
            id: session.id,
            status: SessionStatus.SCHEDULED,
            teacherId: existing.substituteTeacherId!,
            teachingAssignmentId: session.teachingAssignmentId,
            substitutionSourceTeacherId: existing.applicantId,
            substitutionSourceAssignmentId: session.substitutionSourceAssignmentId
          },
          data: {
            teacherId: existing.applicantId,
            teachingAssignmentId: session.substitutionSourceAssignmentId,
            substitutionSourceTeacherId: null,
            substitutionSourceAssignmentId: null
          }
        });
        if (restored.count !== 1) this.revokeUnsafe();
      }
    }
  }

  async revoke(id: string, actor: { sub: string; role: Role }, payload: RevokeTeacherLeaveDto) {
    const reason = requiredText(payload.reason, 'Alasan pencabutan wajib diisi.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockLeave(tx, id);
      const existing = await tx.teacherLeave.findUnique({ where: { id }, select: LEAVE_SELECT });
      if (!existing) throw new NotFoundException('Pengajuan tidak ditemukan.');
      this.assertCanReview(actor, existing);
      if (existing.status !== TeacherLeaveStatus.APPROVED) throw new ConflictException('Hanya izin APPROVED yang dapat dicabut.');

      await this.lockRange(tx, existing.applicantId, existing.startDate, existing.endDate);
      if (existing.applicantRole === Role.GURU_MAPEL) await this.rollbackTeacherApproval(tx, existing);

      const updated = await tx.teacherLeave.update({
        where: { id },
        data: {
          status: TeacherLeaveStatus.CANCELLED,
          cancelledById: actor.sub,
          cancelledAt: new Date(),
          cancellationReason: reason
        },
        select: LEAVE_SELECT
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'teacher-leave',
        action: 'personnel_leave.revoked',
        resource: 'teacherLeave',
        resourceId: id,
        reason,
        before: leaveAuditSnapshot(existing),
        after: leaveAuditSnapshot(updated)
      });
      await tx.notification.create({
        data: {
          userId: existing.applicantId,
          type: NotificationType.SYSTEM,
          title: 'Persetujuan izin dicabut',
          body: reason,
          href: applicantHref(existing.applicantRole)
        }
      });
      return updated;
    });
  }

  async hasApprovedLeave(teacherId: string, date: Date) {
    const key = businessDateKey(date);
    const businessDate = parseDate(key);
    return this.prisma.teacherLeave.findFirst({
      where: {
        applicantId: teacherId,
        applicantRole: Role.GURU_MAPEL,
        status: TeacherLeaveStatus.APPROVED,
        startDate: { lte: businessDate },
        endDate: { gte: businessDate }
      }
    });
  }
}
