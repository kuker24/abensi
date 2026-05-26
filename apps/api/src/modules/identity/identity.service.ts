import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CardStatus, Prisma, Role } from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, ImportUserRowDto, PermanentDeleteUserDto, UpdateMeDto, UpdateUserDto } from './identity.dto';
import bcrypt from 'bcryptjs';
import { writeAudit } from '../../common/audit-log';

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          active: true,
          cardStatus: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }

  private assertDeveloperMutationAllowed(targetRole: Role | undefined, actorRole?: string) {
    if (targetRole === Role.DEVELOPER && actorRole !== Role.DEVELOPER) {
      throw new ForbiddenException('Akun developer hanya boleh dikelola oleh developer.');
    }
  }

  async createUser(payload: CreateUserDto, actorId: string, actorRole?: string) {
    this.assertDeveloperMutationAllowed(payload.role, actorRole);
    const exists = await this.prisma.user.findUnique({ where: { username: payload.username } });
    if (exists) {
      throw new ConflictException('Username sudah terpakai.');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: payload.username,
        fullName: payload.fullName,
        passwordHash,
        role: payload.role,
        cardStatus: payload.cardStatus
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        cardStatus: true,
        active: true
      }
    });

    await writeAudit(this.prisma, {
      actorId,
      actorRole: actorRole as Role | undefined,
      module: 'identity',
      action: 'user.created',
      resource: 'user',
      resourceId: user.id,
      after: user as Prisma.InputJsonValue
    });

    return user;
  }

  async updateUser(userId: string, payload: UpdateUserDto, actor: { sub: string; role: string }) {
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new NotFoundException('Pengguna tidak ditemukan.');
    if (before.role === Role.DEVELOPER && actor.role !== Role.DEVELOPER) {
      throw new ForbiddenException('Akun developer hanya boleh diubah oleh developer.');
    }
    this.assertDeveloperMutationAllowed(payload.role, actor.role);
    if (before.role === Role.DEVELOPER && payload.active === false) {
      const activeDevelopers = await this.prisma.user.count({ where: { role: Role.DEVELOPER, active: true } });
      if (activeDevelopers <= 1) throw new ForbiddenException('Minimal satu akun developer aktif harus tetap tersedia.');
    }

    const passwordHash = payload.password ? await bcrypt.hash(payload.password, 10) : undefined;
    const shouldRevokeSessions = Boolean(passwordHash || payload.role !== undefined || payload.active !== undefined);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
          ...(passwordHash ? { passwordHash, passwordChangedAt: new Date() } : {}),
          ...(payload.role !== undefined ? { role: payload.role } : {}),
          ...(payload.cardStatus !== undefined ? { cardStatus: payload.cardStatus } : {}),
          ...(payload.active !== undefined ? { active: payload.active } : {}),
          ...(shouldRevokeSessions ? { sessionVersion: { increment: 1 } } : {})
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          cardStatus: true,
          active: true,
          updatedAt: true
        }
      });

      const revoked = shouldRevokeSessions
        ? await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'identity-changed' } })
        : { count: 0 };

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'identity',
        action: payload.active === false ? 'user.deactivated' : 'user.updated',
        resource: 'user',
        resourceId: userId,
        reason: payload.reason,
        before: {
          id: before.id,
          username: before.username,
          fullName: before.fullName,
          role: before.role,
          cardStatus: before.cardStatus,
          active: before.active
        } as Prisma.InputJsonValue,
        after: { ...user, revokedSessionCount: revoked.count } as Prisma.InputJsonValue
      });

      return user;
    });
  }

  deactivateUser(userId: string, actor: { sub: string; role: string }, reason?: string) {
    return this.updateUser(userId, { active: false, reason: reason ?? 'Pengguna dinonaktifkan oleh admin.' }, actor);
  }

  private async protectedRelationCounts(userId: string) {
    const [
      taughtSessions,
      enrollments,
      gateLogs,
      studentAttendances,
      teacherPresences,
      flaggedAnomalies,
      resolvedAnomalies,
      assignedAnomalies,
      createdEscalations,
      closedEscalations,
      createdPicketNotes,
      updatedPicketNotes,
      actorAudits,
      smartCards,
      teacherLeaves,
      reviewedTeacherLeaves,
      substituteLeaves,
      weeklySchedules,
      prayerAttendances,
      createdPrayerLogs,
      attendanceOverrides,
      createdAttendanceOverrides,
      correctionEventsAsActor
    ] = await Promise.all([
      this.prisma.session.count({ where: { teacherId: userId } }),
      this.prisma.classEnrollment.count({ where: { studentId: userId } }),
      this.prisma.gateLog.count({ where: { userId } }),
      this.prisma.studentAttendance.count({ where: { studentId: userId } }),
      this.prisma.teacherSessionPresence.count({ where: { teacherId: userId } }),
      this.prisma.reconciliationFlag.count({ where: { userId } }),
      this.prisma.reconciliationFlag.count({ where: { resolvedById: userId } }),
      this.prisma.reconciliationFlag.count({ where: { assignedToId: userId } }),
      this.prisma.reconciliationEscalation.count({ where: { createdById: userId } }),
      this.prisma.reconciliationEscalation.count({ where: { closedById: userId } }),
      this.prisma.picketNote.count({ where: { createdById: userId } }),
      this.prisma.picketNote.count({ where: { updatedById: userId } }),
      this.prisma.auditEntry.count({ where: { actorId: userId } }),
      this.prisma.smartCard.count({ where: { userId } }),
      this.prisma.teacherLeave.count({ where: { teacherId: userId } }),
      this.prisma.teacherLeave.count({ where: { reviewedById: userId } }),
      this.prisma.teacherLeave.count({ where: { substituteTeacherId: userId } }),
      this.prisma.weeklySchedule.count({ where: { teacherId: userId } }),
      this.prisma.prayerAttendanceLog.count({ where: { studentId: userId } }),
      this.prisma.prayerAttendanceLog.count({ where: { createdById: userId } }),
      this.prisma.attendanceOverride.count({ where: { studentId: userId } }),
      this.prisma.attendanceOverride.count({ where: { createdById: userId } }),
      this.prisma.attendanceCorrectionEvent.count({ where: { actorId: userId } })
    ]);

    return {
      taughtSessions,
      enrollments,
      gateLogs,
      studentAttendances,
      teacherPresences,
      flaggedAnomalies,
      resolvedAnomalies,
      assignedAnomalies,
      createdEscalations,
      closedEscalations,
      createdPicketNotes,
      updatedPicketNotes,
      actorAudits,
      smartCards,
      teacherLeaves,
      reviewedTeacherLeaves,
      substituteLeaves,
      weeklySchedules,
      prayerAttendances,
      createdPrayerLogs,
      attendanceOverrides,
      createdAttendanceOverrides,
      correctionEventsAsActor
    };
  }

  private relationBlockReasons(counts: Record<string, number>) {
    const labels: Record<string, string> = {
      taughtSessions: 'sesi mengajar',
      enrollments: 'pendaftaran kelas',
      gateLogs: 'riwayat scan gerbang',
      studentAttendances: 'presensi siswa',
      teacherPresences: 'absen guru',
      flaggedAnomalies: 'anomali',
      resolvedAnomalies: 'penyelesaian anomali',
      assignedAnomalies: 'penugasan anomali',
      createdEscalations: 'eskalasi dibuat',
      closedEscalations: 'eskalasi ditutup',
      createdPicketNotes: 'catatan buku piket',
      updatedPicketNotes: 'perubahan buku piket',
      actorAudits: 'catatan audit sebagai pelaku',
      smartCards: 'kartu tertaut',
      teacherLeaves: 'pengajuan izin guru',
      reviewedTeacherLeaves: 'review pengajuan guru',
      substituteLeaves: 'data guru pengganti',
      weeklySchedules: 'jadwal mingguan',
      prayerAttendances: 'riwayat scan mushola',
      createdPrayerLogs: 'scan mushola manual',
      attendanceOverrides: 'override presensi',
      createdAttendanceOverrides: 'override dibuat',
      correctionEventsAsActor: 'koreksi presensi sebagai pelaku'
    };
    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => `${labels[key] || key}: ${value}`);
  }

  async deleteUserPermanently(userId: string, payload: PermanentDeleteUserDto, actor: { sub: string; role: string }) {
    if (actor.role !== Role.DEVELOPER) throw new ForbiddenException('Hapus permanen hanya boleh dilakukan Developer.');
    if (actor.sub === userId) throw new ForbiddenException('Anda tidak boleh menghapus akun sendiri.');
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, fullName: true, role: true, active: true, cardStatus: true }
    });
    if (!target) throw new NotFoundException('Pengguna tidak ditemukan.');
    if (payload.confirmUsername !== target.username) throw new BadRequestException('Konfirmasi nama akun tidak sesuai.');
    if (target.role === Role.DEVELOPER) {
      const activeDevelopers = await this.prisma.user.count({ where: { role: Role.DEVELOPER, active: true } });
      if (activeDevelopers <= 1) throw new ForbiddenException('Minimal satu akun developer aktif harus tetap tersedia.');
    }

    const counts = await this.protectedRelationCounts(userId);
    const reasons = this.relationBlockReasons(counts);
    if (reasons.length > 0) {
      await writeAudit(this.prisma, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'identity',
        action: 'identity.user.permanent_delete_blocked',
        resource: 'user',
        resourceId: target.id,
        reason: payload.reason,
        before: target as Prisma.InputJsonValue,
        after: { blockedReasons: reasons, relationCounts: counts } as Prisma.InputJsonValue
      });
      throw new ConflictException(`Akun ini punya riwayat penting (${reasons.slice(0, 5).join(', ')}). Nonaktifkan saja agar data tetap aman.`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userTutorialState.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'identity',
        action: 'identity.user.permanently_deleted',
        resource: 'user',
        resourceId: target.id,
        reason: payload.reason,
        before: target as Prisma.InputJsonValue,
        after: { deleted: true, username: target.username, role: target.role }
      });
    });

    return { deleted: true, id: target.id, username: target.username };
  }

  async previewUsersImport(rows: ImportUserRowDto[]) {
    const normalized = rows.map((row, index) => ({
      index: index + 1,
      username: row.username?.trim(),
      fullName: row.fullName?.trim(),
      role: row.role,
      password: row.password?.trim() || '',
      errors: [] as string[]
    }));

    const usernames = normalized.map((row) => row.username).filter(Boolean);
    const existing = await this.prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { username: true }
    });
    const existingSet = new Set(existing.map((item) => item.username));

    for (const row of normalized) {
      if (!row.username) row.errors.push('username wajib');
      if (!row.fullName) row.errors.push('fullName wajib');
      if (!Object.values(Role).includes(row.role)) row.errors.push('role tidak valid');
      if (row.role === Role.DEVELOPER) row.errors.push('role DEVELOPER hanya dibuat dari seed/env atau akun developer.');
      if (existingSet.has(row.username)) row.errors.push('username sudah ada');
      if (!row.password) row.errors.push('password wajib diisi');
      else if (row.password.length < 8) row.errors.push('password minimal 8 karakter');
    }

    return {
      rows: normalized.map(({ password: _password, ...row }) => row),
      summary: {
        total: normalized.length,
        valid: normalized.filter((row) => row.errors.length === 0).length,
        invalid: normalized.filter((row) => row.errors.length > 0).length
      }
    };
  }

  async commitUsersImport(rows: ImportUserRowDto[], actor: { sub: string; role: string }) {
    const preview = await this.previewUsersImport(rows);
    if (preview.summary.invalid > 0) {
      return { committed: false, ...preview };
    }

    const created = [];
    for (const row of rows) {
      const passwordHash = await bcrypt.hash(row.password!.trim(), 10);
      created.push(await this.prisma.user.create({
        data: {
          username: row.username.trim(),
          fullName: row.fullName.trim(),
          role: row.role,
          passwordHash,
          cardStatus: CardStatus.ACTIVE
        },
        select: { id: true, username: true, fullName: true, role: true, active: true }
      }));
    }

    await writeAudit(this.prisma, {
      actorId: actor.sub,
      actorRole: actor.role as Role,
      module: 'identity',
      action: 'user.import.committed',
      resource: 'user',
      resourceId: 'bulk-import',
      after: { count: created.length, usernames: created.map((item) => item.username) }
    });

    return { committed: true, createdCount: created.length, items: created };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        active: true,
        cardStatus: true,
        createdAt: true,
        smartCard: {
          select: {
            id: true,
            uid: true,
            status: true
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan.');
    }

    return user;
  }

  async updateMe(userId: string, payload: UpdateMeDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: payload.fullName
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        active: true,
        cardStatus: true
      }
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      module: 'identity',
      action: 'user.profile.updated',
      resource: 'user',
      resourceId: userId,
      after: user as Prisma.InputJsonValue
    });

    return user;
  }
}
