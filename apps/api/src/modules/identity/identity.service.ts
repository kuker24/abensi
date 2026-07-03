import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CardStatus, Prisma, QrCredentialStatus, Role } from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, GenerateAccountSlipsDto, ImportUserRowDto, PermanentDeleteUserDto, UpdateMeDto, UpdateUserDto } from './identity.dto';
import bcrypt from 'bcryptjs';
import { writeAudit } from '../../common/audit-log';
import { generateAccountSlipPassword } from './account-slip-password.util';

const ACCOUNT_SLIP_CREATOR_ROLES = new Set<Role>([Role.ADMIN_TU, Role.DEVELOPER]);
const ACCOUNT_SLIP_TARGET_ROLES = new Set<Role>([Role.SISWA, Role.GURU_MAPEL, Role.GURU_PIKET, Role.KEPALA_SEKOLAH]);
const MAX_ACCOUNT_SLIP_USERS = 50;

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

  async generateAccountLoginSlips(payload: GenerateAccountSlipsDto, actor: { sub: string; role: string }) {
    if (!ACCOUNT_SLIP_CREATOR_ROLES.has(actor.role as Role)) {
      throw new ForbiddenException('Lembar akun login hanya boleh dibuat oleh Admin TU atau Developer.');
    }

    const uniqueUserIds = [...new Set((payload.userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (uniqueUserIds.length === 0) throw new BadRequestException('Pilih minimal satu pengguna.');
    if (uniqueUserIds.length > MAX_ACCOUNT_SLIP_USERS) throw new BadRequestException(`Maksimal ${MAX_ACCOUNT_SLIP_USERS} pengguna per batch.`);

    const reason = String(payload.reason || '').trim();
    if (reason.length < 10) throw new BadRequestException('Alasan wajib diisi minimal 10 karakter.');
    const revokeSessions = payload.revokeSessions !== false;

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, username: true, fullName: true, role: true, active: true }
    });
    const foundIds = new Set(users.map((user) => user.id));
    const missingIds = uniqueUserIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) throw new BadRequestException('Sebagian pengguna tidak ditemukan.');

    const inactiveUsers = users.filter((user) => !user.active);
    if (inactiveUsers.length > 0) throw new BadRequestException('Lembar akun hanya boleh dibuat untuk pengguna aktif.');

    const unsupportedUsers = users.filter((user) => !ACCOUNT_SLIP_TARGET_ROLES.has(user.role));
    if (unsupportedUsers.length > 0) throw new ForbiddenException('Target lembar akun hanya SISWA, GURU_MAPEL, GURU_PIKET, atau KEPALA_SEKOLAH.');

    const prepared = await Promise.all(users.map(async (user) => {
      const initialPassword = generateAccountSlipPassword();
      return {
        user,
        initialPassword,
        passwordHash: await bcrypt.hash(initialPassword, 10)
      };
    }));
    const now = new Date();

    const roleDistribution = prepared.reduce<Record<string, number>>((acc, item) => {
      acc[item.user.role] = (acc[item.user.role] || 0) + 1;
      return acc;
    }, {});

    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      for (const item of prepared) {
        await tx.user.update({
          where: { id: item.user.id },
          data: {
            passwordHash: item.passwordHash,
            mustChangePassword: false,
            passwordChangedAt: null,
            sessionVersion: { increment: 1 }
          }
        });
      }

      const revoked = revokeSessions
        ? await tx.authSession.updateMany({
          where: { userId: { in: uniqueUserIds }, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'account-slip-generated' }
        })
        : { count: 0 };

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'identity',
        action: 'account_slips.generated',
        resource: 'user',
        resourceId: 'bulk-account-slip',
        reason,
        after: {
          count: prepared.length,
          userIds: uniqueUserIds,
          roleDistribution,
          revokeSessions,
          revokedSessions: revoked.count
        } as Prisma.InputJsonValue
      });

      return revoked.count;
    });

    return {
      generatedAt: now.toISOString(),
      revokeSessions,
      revokedSessions,
      slips: prepared.map((item) => ({
        userId: item.user.id,
        fullName: item.user.fullName,
        username: item.user.username,
        role: item.user.role,
        initialPassword: item.initialPassword
      }))
    };
  }

  async createUser(payload: CreateUserDto, actorId: string, actorRole?: string) {
    this.assertDeveloperMutationAllowed(payload.role, actorRole);
    const exists = await this.prisma.user.findUnique({ where: { username: payload.username } });
    if (exists) {
      throw new ConflictException('Username sudah terpakai.');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: payload.username,
          fullName: payload.fullName,
          passwordHash,
          mustChangePassword: true,
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

      await writeAudit(tx, {
        actorId,
        actorRole: actorRole as Role | undefined,
        module: 'identity',
        action: 'user.created',
        resource: 'user',
        resourceId: user.id,
        after: user as Prisma.InputJsonValue
      });

      return user;
    });
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
      const deactivatedAt = payload.active === false ? new Date() : null;
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
          ...(passwordHash ? { passwordHash, passwordChangedAt: null, mustChangePassword: true } : {}),
          ...(payload.role !== undefined ? { role: payload.role } : {}),
          ...(payload.cardStatus !== undefined ? { cardStatus: payload.cardStatus } : {}),
          ...(deactivatedAt ? { cardStatus: CardStatus.INACTIVE } : {}),
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
        ? await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: deactivatedAt ?? new Date(), revokedReason: 'identity-changed' } })
        : { count: 0 };
      const revokedQr = deactivatedAt
        ? await tx.qrCredential.updateMany({
          where: { userId, status: QrCredentialStatus.ACTIVE },
          data: {
            status: QrCredentialStatus.REVOKED,
            revokedAt: deactivatedAt,
            revokedById: actor.sub,
            revokeReason: payload.reason || 'Pengguna dinonaktifkan.'
          }
        })
        : { count: 0 };
      const inactiveSmartCards = deactivatedAt
        ? await tx.smartCard.updateMany({ where: { userId, status: { not: CardStatus.INACTIVE } }, data: { status: CardStatus.INACTIVE } })
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
        after: { ...user, revokedSessionCount: revoked.count, revokedQrCredentialCount: revokedQr.count, inactiveSmartCardCount: inactiveSmartCards.count } as Prisma.InputJsonValue
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
      await this.prisma.$transaction(async (tx) => {
        await writeAudit(tx, {
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

    const prepared = await Promise.all(rows.map(async (row) => ({ row, passwordHash: await bcrypt.hash(row.password!.trim(), 10) })));

    return this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const { row, passwordHash } of prepared) {
        created.push(await tx.user.create({
          data: {
            username: row.username.trim(),
            fullName: row.fullName.trim(),
            role: row.role,
            passwordHash,
            mustChangePassword: true,
            cardStatus: CardStatus.ACTIVE
          },
          select: { id: true, username: true, fullName: true, role: true, active: true }
        }));
      }

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'identity',
        action: 'user.import.committed',
        resource: 'user',
        resourceId: 'bulk-import',
        after: { count: created.length, usernames: created.map((item) => item.username) }
      });

      return { committed: true, createdCount: created.length, items: created };
    });
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
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
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

      await writeAudit(tx, {
        actorId: userId,
        module: 'identity',
        action: 'user.profile.updated',
        resource: 'user',
        resourceId: userId,
        after: user as Prisma.InputJsonValue
      });

      return user;
    });
  }
}
