import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Role, SessionStatus, TeacherLeaveStatus, TeacherSessionStatus, type Prisma } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTeacherLeaveDto, ReviewTeacherLeaveDto } from './teacher-leave.dto';

function dayRange(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Tanggal tidak valid.');
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(date); end.setHours(23, 59, 59, 999);
  return { date: start, start, end };
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

    const leave = await this.prisma.teacherLeave.create({
      data: {
        teacherId: user.sub,
        type: payload.type,
        date,
        reason: payload.reason
      },
      include: { teacher: { select: { fullName: true } } }
    });

    await writeAudit(this.prisma, {
      actorId: user.sub,
      actorRole: user.role,
      module: 'teacher-leave',
      action: 'teacher_leave.submitted',
      resource: 'teacherLeave',
      resourceId: leave.id,
      reason: payload.reason,
      after: leave
    });

    await this.notifications.notifyRoles([Role.ADMIN_TU], {
      type: NotificationType.LEAVE_SUBMITTED,
      title: 'Pengajuan guru masuk',
      body: `${leave.teacher.fullName} mengajukan ${payload.type}.`,
      href: '/admin/teacher-leaves'
    });

    return leave;
  }

  async review(id: string, actor: { sub: string; role: Role }, payload: ReviewTeacherLeaveDto) {
    if (payload.status === TeacherLeaveStatus.PENDING) {
      throw new BadRequestException('Status review tidak valid.');
    }

    const existing = await this.prisma.teacherLeave.findUnique({ where: { id }, include: { teacher: true } });
    if (!existing) throw new NotFoundException('Pengajuan tidak ditemukan.');

    const { start, end } = dayRange(existing.date);

    return this.prisma.$transaction(async (tx) => {
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
        const sessions = await tx.session.findMany({
          where: { teacherId: existing.teacherId, startsAt: { gte: start, lte: end }, status: { in: [SessionStatus.SCHEDULED, SessionStatus.MISSED] } }
        });

        for (const session of sessions) {
          await tx.teacherSessionPresence.upsert({
            where: { sessionId_teacherId: { sessionId: session.id, teacherId: existing.teacherId } },
            update: { status: TeacherSessionStatus.EXCUSED_ABSENCE },
            create: { sessionId: session.id, teacherId: existing.teacherId, status: TeacherSessionStatus.EXCUSED_ABSENCE }
          });
          if (payload.substituteTeacherId && session.status === SessionStatus.SCHEDULED) {
            await tx.session.update({ where: { id: session.id }, data: { teacherId: payload.substituteTeacherId } });
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
