import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, Role, SessionStatus, TeacherLeaveStatus, TeacherSessionStatus } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { businessDayBounds } from '../../common/business-time';
import { PrismaService } from '../../prisma/prisma.service';
import { lockScheduleMutationRows } from '../../common/schedule-mutation-lock';
import { NotificationsService } from '../notifications/notifications.service';
import { lockTeacherLeaveBusinessDate } from '../scheduling/teacher-leave-lock';
import { CreateTeacherLeaveDto, ReviewTeacherLeaveDto } from './teacher-leave.dto';

function dayRange(value: string | Date) {
  try {
    const { date, start, end } = businessDayBounds(value);
    return { date, start, end };
  } catch {
    throw new BadRequestException('Tanggal tidak valid.');
  }
}

@Injectable()
export class TeacherLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async list(user: { sub: string; role: Role }, pagination: PaginationQuery, status?: TeacherLeaveStatus) {
    const where: Prisma.TeacherLeaveWhereInput = {
      ...(status ? { status } : {}),
      ...(user.role === Role.GURU_MAPEL ? { teacherId: user.sub } : {})
    };

    const [total, items] = await Promise.all([
      this.prisma.teacherLeave.count({ where }),
      this.prisma.teacherLeave.findMany({
        where,
        include: {
          teacher: { select: { id: true, fullName: true, username: true, role: true } },
          reviewedBy: { select: { id: true, fullName: true } },
          substituteTeacher: { select: { id: true, fullName: true, role: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return { items, meta: buildPaginationMeta(total, pagination) };
  }

  async create(user: { sub: string; role: Role }, payload: CreateTeacherLeaveDto) {
    if (user.role !== Role.GURU_MAPEL && user.role !== Role.GURU_PIKET) {
      throw new ForbiddenException('Hanya guru yang dapat mengajukan keterangan.');
    }
    const { date } = dayRange(payload.date);

    const leave = await this.prisma.$transaction(async (tx) => {
      const created = await tx.teacherLeave.create({
        data: {
          teacherId: user.sub,
          type: payload.type,
          date,
          reason: payload.reason
        },
        include: { teacher: { select: { fullName: true } } }
      });

      await writeAudit(tx, {
        actorId: user.sub,
        actorRole: user.role,
        module: 'teacher-leave',
        action: 'teacher_leave.submitted',
        resource: 'teacherLeave',
        resourceId: created.id,
        reason: payload.reason,
        after: created
      });
      return created;
    });

    await this.notifications.notifyRoles([Role.ADMIN_TU], {
      type: NotificationType.LEAVE_SUBMITTED,
      title: 'Pengajuan guru masuk',
      body: `${leave.teacher.fullName} mengajukan ${payload.type}.`,
      href: '/admin/teacher-leaves'
    });

    return leave;
  }

  private async lockTeacherLeave(tx: Prisma.TransactionClient, leaveId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TeacherLeave" WHERE "id" = ${leaveId} FOR UPDATE`);
  }


  private substituteAssignmentRequired(): never {
    throw new ConflictException({
      code: 'TEACHER_LEAVE_SUBSTITUTE_ASSIGNMENT_REQUIRED',
      message: 'Buat penugasan mengajar formal pengganti terlebih dahulu sebelum menyetujui keterangan guru.'
    });
  }

  private substituteTeacherInvalid(): never {
    throw new BadRequestException({
      code: 'TEACHER_LEAVE_SUBSTITUTE_TEACHER_INVALID',
      message: 'Guru pengganti harus akun GURU_MAPEL yang aktif.'
    });
  }

  private substituteTeacherSelfNotAllowed(): never {
    throw new BadRequestException({
      code: 'TEACHER_LEAVE_SUBSTITUTE_SELF_NOT_ALLOWED',
      message: 'Guru pengganti tidak boleh sama dengan guru yang mengajukan keterangan.'
    });
  }

  private leaveAlreadyReviewed(): never {
    throw new ConflictException({
      code: 'TEACHER_LEAVE_ALREADY_REVIEWED',
      message: 'Pengajuan sudah ditinjau. Muat ulang halaman sebelum mencoba lagi.'
    });
  }

  private sessionStateChanged(): never {
    throw new ConflictException({
      code: 'TEACHER_LEAVE_SESSION_STATE_CHANGED',
      message: 'Status sesi berubah saat penggantian guru diproses. Muat ulang lalu coba lagi.'
    });
  }

  private leaveDateAlreadyApproved(): never {
    throw new ConflictException({
      code: 'TEACHER_LEAVE_DATE_ALREADY_APPROVED',
      message: 'Sudah ada keterangan guru yang disetujui pada tanggal tersebut.'
    });
  }

  async review(id: string, actor: { sub: string; role: Role }, payload: ReviewTeacherLeaveDto) {
    if (payload.status === TeacherLeaveStatus.PENDING) {
      throw new BadRequestException('Status review tidak valid.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockTeacherLeave(tx, id);
      const existing = await tx.teacherLeave.findUnique({ where: { id }, include: { teacher: true } });
      if (!existing) throw new NotFoundException('Pengajuan tidak ditemukan.');
      if (existing.status !== TeacherLeaveStatus.PENDING) this.leaveAlreadyReviewed();

      const { start, end, date } = dayRange(existing.date);
      if (payload.substituteTeacherId === existing.teacherId) this.substituteTeacherSelfNotAllowed();
      // Leave row lock first. Both leave approval and schedule creation then use
      // this same teacher/date advisory key before Session or assignment locks.
      await lockTeacherLeaveBusinessDate(tx, existing.teacherId, date);
      if (payload.status === TeacherLeaveStatus.APPROVED) {
        const alreadyApproved = await tx.teacherLeave.findFirst({
          where: {
            teacherId: existing.teacherId,
            status: TeacherLeaveStatus.APPROVED,
            date: { gte: start, lte: end },
            id: { not: existing.id }
          },
          select: { id: true }
        });
        if (alreadyApproved) this.leaveDateAlreadyApproved();
      }
      if (payload.substituteTeacherId) {
        await lockScheduleMutationRows(tx, { userIds: [payload.substituteTeacherId] });
        const substitute = await tx.user.findUnique({
          where: { id: payload.substituteTeacherId },
          select: { id: true, active: true, role: true }
        });
        if (!substitute || !substitute.active || substitute.role !== Role.GURU_MAPEL) this.substituteTeacherInvalid();
      }

      const sessions = payload.status === TeacherLeaveStatus.APPROVED
        ? await tx.session.findMany({
          where: {
            OR: [
              { teacherId: existing.teacherId },
              { substitutionSourceTeacherId: existing.teacherId }
            ],
            startsAt: { gte: start, lte: end },
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
        })
        : [];
      const substituteAssignments = new Map<string, string>();

      if (payload.status === TeacherLeaveStatus.APPROVED && payload.substituteTeacherId) {
        const scheduledSessions = sessions.filter((session) => session.status === SessionStatus.SCHEDULED);
        const sourceAssignmentIds = scheduledSessions.map((session) => session.substitutionSourceAssignmentId ?? session.teachingAssignmentId);
        if (sourceAssignmentIds.some((assignmentId) => !assignmentId)) this.substituteAssignmentRequired();
        const sourceAssignments = sourceAssignmentIds.length === 0
          ? []
          : await tx.teachingAssignment.findMany({
            where: { id: { in: sourceAssignmentIds.filter((assignmentId): assignmentId is string => Boolean(assignmentId)) } },
            select: { id: true, academicYearId: true, semesterId: true },
            orderBy: { id: 'asc' }
          });
        const sourceAssignmentsById = new Map(sourceAssignments.map((assignment) => [assignment.id, assignment]));
        if (sourceAssignmentsById.size !== new Set(sourceAssignmentIds).size) this.substituteAssignmentRequired();

        const candidateAssignments = new Map<string, string>();
        for (const session of scheduledSessions) {
          const formalAssignmentId = session.substitutionSourceAssignmentId ?? session.teachingAssignmentId;
          const formalAssignment = formalAssignmentId ? sourceAssignmentsById.get(formalAssignmentId) : null;
          if (!formalAssignment) this.substituteAssignmentRequired();
          const candidate = await tx.teachingAssignment.findFirst({
            where: {
              teacherId: payload.substituteTeacherId,
              classId: session.classId,
              subjectId: session.subjectId,
              academicYearId: formalAssignment.academicYearId,
              semesterId: formalAssignment.semesterId,
              active: true,
              effectiveFrom: { lte: session.businessDate },
              effectiveTo: { gte: session.businessDate }
            },
            select: { id: true },
            orderBy: { id: 'asc' }
          });
          if (!candidate) this.substituteAssignmentRequired();
          candidateAssignments.set(session.id, candidate.id);
        }

        const candidateAssignmentIds = [...new Set(candidateAssignments.values())];
        await lockScheduleMutationRows(tx, {
          academicYearIds: [
            ...sessions.map((session) => session.substitutionSourceAssignment?.academicYearId ?? session.teachingAssignment?.academicYearId),
            ...sourceAssignments.map((assignment) => assignment.academicYearId)
          ],
          semesterIds: [
            ...sessions.map((session) => session.substitutionSourceAssignment?.semesterId ?? session.teachingAssignment?.semesterId),
            ...sourceAssignments.map((assignment) => assignment.semesterId)
          ],
          teachingAssignmentIds: [...sourceAssignmentIds.filter((assignmentId): assignmentId is string => Boolean(assignmentId)), ...candidateAssignmentIds],
          sessionIds: scheduledSessions.map((session) => session.id)
        });

        const lockedSessions = await tx.session.findMany({
          where: { id: { in: scheduledSessions.map((session) => session.id) } },
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
            substitutionSourceAssignmentId: true,
            teachingAssignment: { select: { academicYearId: true, semesterId: true } },
            substitutionSourceAssignment: { select: { academicYearId: true, semesterId: true } }
          },
          orderBy: { id: 'asc' }
        });
        const lockedSessionsById = new Map(lockedSessions.map((session) => [session.id, session]));
        for (const session of scheduledSessions) {
          const locked = lockedSessionsById.get(session.id);
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
            || (locked.substitutionSourceTeacherId && locked.substitutionSourceTeacherId !== existing.teacherId)
          ) this.sessionStateChanged();
        }

        const allAssignmentIds = [...sourceAssignmentIds.filter((assignmentId): assignmentId is string => Boolean(assignmentId)), ...candidateAssignmentIds];
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

        for (const session of scheduledSessions) {
          const locked = lockedSessionsById.get(session.id)!;
          const sourceAssignmentId = locked.substitutionSourceAssignmentId ?? locked.teachingAssignmentId;
          const candidateId = candidateAssignments.get(session.id)!;
          const assignment = lockedAssignmentsById.get(candidateId);
          const formalAssignment = sourceAssignmentId ? lockedAssignmentsById.get(sourceAssignmentId) : null;
          if (
            !assignment
            || !formalAssignment
            || !assignment.active
            || assignment.teacherId !== payload.substituteTeacherId
            || assignment.classId !== locked.classId
            || assignment.subjectId !== locked.subjectId
            || assignment.academicYearId !== formalAssignment.academicYearId
            || assignment.semesterId !== formalAssignment.semesterId
            || assignment.effectiveFrom > locked.businessDate
            || assignment.effectiveTo < locked.businessDate
          ) this.substituteAssignmentRequired();
          substituteAssignments.set(session.id, assignment.id);
        }
      }

      const updated = await tx.teacherLeave.update({
        where: { id },
        data: {
          status: payload.status,
          adminNote: payload.adminNote,
          reviewedById: actor.sub,
          reviewedAt: new Date(),
          substituteTeacherId: payload.substituteTeacherId || null
        },
        include: {
          teacher: { select: { id: true, fullName: true } },
          substituteTeacher: { select: { id: true, fullName: true } }
        }
      });

      if (payload.status === TeacherLeaveStatus.APPROVED) {
        for (const session of sessions) {
          await tx.teacherSessionPresence.upsert({
            where: { sessionId_teacherId: { sessionId: session.id, teacherId: existing.teacherId } },
            update: { status: TeacherSessionStatus.EXCUSED_ABSENCE },
            create: { sessionId: session.id, teacherId: existing.teacherId, status: TeacherSessionStatus.EXCUSED_ABSENCE }
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
                teacherId: payload.substituteTeacherId!,
                teachingAssignmentId: substituteAssignmentId,
                substitutionSourceTeacherId: existing.teacherId,
                substitutionSourceAssignmentId: session.substitutionSourceAssignmentId ?? session.teachingAssignmentId
              }
            });
            if (swapped.count !== 1) this.sessionStateChanged();
          }
        }
      }

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'teacher-leave',
        action: payload.status === TeacherLeaveStatus.APPROVED ? 'teacher_leave.approved' : 'teacher_leave.reviewed',
        resource: 'teacherLeave',
        resourceId: id,
        reason: payload.adminNote,
        before: existing,
        after: updated
      });

      await tx.notification.create({
        data: {
          userId: existing.teacherId,
          type: payload.status === TeacherLeaveStatus.APPROVED ? NotificationType.LEAVE_APPROVED : NotificationType.LEAVE_REJECTED,
          title: payload.status === TeacherLeaveStatus.APPROVED ? 'Pengajuan disetujui' : 'Pengajuan diperbarui',
          body: payload.adminNote || `Status pengajuan Anda: ${payload.status}`,
          href: '/guru/izin'
        }
      });

      return updated;
    });
  }

  async hasApprovedLeave(teacherId: string, date: Date) {
    const { start, end } = dayRange(date);
    return this.prisma.teacherLeave.findFirst({
      where: { teacherId, status: TeacherLeaveStatus.APPROVED, date: { gte: start, lte: end } }
    });
  }
}
