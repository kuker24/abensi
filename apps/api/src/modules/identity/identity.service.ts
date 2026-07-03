import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CardStatus, Prisma, QrCredentialStatus, Role } from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigureAccountDeletePinDto, CreateUserDto, DeleteAccountsDto, GenerateAccountSlipsDto, ImportUserRowDto, PermanentDeleteUserDto, PreviewAccountDeleteDto, UpdateMeDto, UpdateUserDto } from './identity.dto';
import bcrypt from 'bcryptjs';
import { writeAudit } from '../../common/audit-log';
import type { RequestMeta } from '../../common/request-meta';
import { generateAccountSlipPassword } from './account-slip-password.util';

const ACCOUNT_SLIP_CREATOR_ROLES = new Set<Role>([Role.ADMIN_TU, Role.DEVELOPER]);
const ACCOUNT_SLIP_TARGET_ROLES = new Set<Role>([Role.SISWA, Role.GURU_MAPEL, Role.GURU_PIKET, Role.KEPALA_SEKOLAH]);
const MAX_ACCOUNT_SLIP_USERS = 50;

const ACCOUNT_DELETE_ACTOR_ROLES = new Set<Role>([Role.ADMIN_TU, Role.DEVELOPER]);
const ACCOUNT_DELETE_TARGET_ROLES = new Set<Role>([Role.SISWA, Role.GURU_MAPEL, Role.GURU_PIKET, Role.KEPALA_SEKOLAH]);
const ACCOUNT_DELETE_SENSITIVE_ROLES = new Set<Role>([Role.DEVELOPER, Role.ADMIN_TU, Role.OPERATOR_IT]);
const MAX_ACCOUNT_DELETE_USERS = 50;
const ACCOUNT_DELETE_CONFIRM_TEXT = 'HAPUS AKUN';
const ACCOUNT_DELETE_PIN_SETTING_ID = 1;
const ACCOUNT_DELETE_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const ACCOUNT_DELETE_RATE_LIMIT_MAX = 10;
const ACCOUNT_DELETE_RATE_LIMITS = new Map<string, { count: number; resetAt: number }>();

type AccountDeleteMode = 'auto' | 'archive-only' | 'hard-delete-only-if-safe';
type AccountDeleteAction = 'HARD_DELETE' | 'ARCHIVE' | 'REJECT';
type AccountDeleteTarget = { id: string; username: string; fullName: string; role: Role; active: boolean; cardStatus: CardStatus; archivedAt: Date | null };

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(pagination: PaginationQuery, filters: { status?: string } = {}) {
    const status = filters.status || 'active';
    const where: Prisma.UserWhereInput = status === 'all'
      ? {}
      : status === 'archived'
        ? { archivedAt: { not: null } }
        : status === 'inactive'
          ? { active: false, archivedAt: null }
          : { active: true, archivedAt: null };

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          active: true,
          cardStatus: true,
          archivedAt: true,
          archivedById: true,
          archiveReason: true,
          deleteMode: true,
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

  private assertAccountDeleteActor(actor: { sub: string; role: string }) {
    if (!ACCOUNT_DELETE_ACTOR_ROLES.has(actor.role as Role)) {
      throw new ForbiddenException('Hapus akun hanya boleh dilakukan Admin TU atau Developer.');
    }
  }

  private normalizeAccountDeleteUserIds(userIds: string[] | undefined) {
    const normalized = (userIds || []).map((id) => String(id || '').trim()).filter(Boolean);
    if (normalized.length === 0) throw new BadRequestException('Pilih minimal satu akun.');
    if (normalized.length > MAX_ACCOUNT_DELETE_USERS) throw new BadRequestException(`Maksimal ${MAX_ACCOUNT_DELETE_USERS} akun per batch.`);
    if (new Set(normalized).size !== normalized.length) throw new BadRequestException('Daftar akun tidak boleh mengandung duplikat.');
    return normalized;
  }

  private assertAccountDeleteRateLimit(actor: { sub: string }) {
    const now = Date.now();
    const key = actor.sub || 'anonymous';
    const state = ACCOUNT_DELETE_RATE_LIMITS.get(key);
    if (!state || state.resetAt <= now) {
      ACCOUNT_DELETE_RATE_LIMITS.set(key, { count: 1, resetAt: now + ACCOUNT_DELETE_RATE_LIMIT_WINDOW_MS });
      return;
    }
    if (state.count >= ACCOUNT_DELETE_RATE_LIMIT_MAX) {
      throw new HttpException('Terlalu banyak percobaan hapus akun. Coba lagi beberapa menit.', HttpStatus.TOO_MANY_REQUESTS);
    }
    state.count += 1;
  }

  private roleDistribution(users: Array<{ role: Role }>) {
    return users.reduce<Record<string, number>>((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});
  }

  async getAccountDeletePinStatus() {
    const setting = await this.prisma.accountDeleteSecuritySetting.findUnique({
      where: { id: ACCOUNT_DELETE_PIN_SETTING_ID },
      select: { id: true, updatedAt: true, updatedById: true }
    });
    return { configured: Boolean(setting), updatedAt: setting?.updatedAt ?? null, updatedById: setting?.updatedById ?? null };
  }

  async configureAccountDeletePin(payload: ConfigureAccountDeletePinDto, actor: { sub: string; role: string }, meta: RequestMeta = {}) {
    this.assertAccountDeleteActor(actor);
    const reason = String(payload.reason || '').trim();
    if (reason.length < 10) throw new BadRequestException('Alasan wajib diisi minimal 10 karakter.');
    if (payload.pin !== payload.confirmPin) throw new BadRequestException('Konfirmasi PIN tidak sama.');
    if (!/^\d{4,12}$/.test(payload.pin)) throw new BadRequestException('PIN harus berupa 4-12 digit angka.');

    const currentUser = await this.prisma.user.findUnique({ where: { id: actor.sub }, select: { id: true, username: true, role: true, active: true, passwordHash: true } });
    if (!currentUser || !currentUser.active) throw new UnauthorizedException('Sesi tidak aktif. Silakan masuk ulang.');
    const passwordOk = await bcrypt.compare(payload.currentPassword, currentUser.passwordHash);
    if (!passwordOk) {
      await this.prisma.$transaction(async (tx) => {
        await writeAudit(tx, {
          actorId: actor.sub,
          actorRole: actor.role as Role,
          module: 'identity',
          action: 'identity.account_delete_pin.configure_failed',
          resource: 'accountDeleteSecuritySetting',
          resourceId: String(ACCOUNT_DELETE_PIN_SETTING_ID),
          reason,
          requestIp: meta.requestIp ?? null,
          requestDevice: meta.requestDevice ?? null,
          after: { failure: 'bad_current_password' } as Prisma.InputJsonValue
        });
      });
      throw new ForbiddenException('Password admin tidak valid.');
    }

    const deletePinHash = await bcrypt.hash(payload.pin, 10);
    const updated = await this.prisma.$transaction(async (tx) => {
      const setting = await tx.accountDeleteSecuritySetting.upsert({
        where: { id: ACCOUNT_DELETE_PIN_SETTING_ID },
        update: { deletePinHash, updatedById: actor.sub },
        create: { id: ACCOUNT_DELETE_PIN_SETTING_ID, deletePinHash, updatedById: actor.sub },
        select: { id: true, updatedAt: true }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'identity',
        action: 'identity.account_delete_pin.configured',
        resource: 'accountDeleteSecuritySetting',
        resourceId: String(setting.id),
        reason,
        requestIp: meta.requestIp ?? null,
        requestDevice: meta.requestDevice ?? null,
        after: { configured: true } as Prisma.InputJsonValue
      });
      return setting;
    });

    return { configured: true, updatedAt: updated.updatedAt };
  }

  private async verifyAccountDeletePin(pin: string, actor: { sub: string; role: string }, meta: RequestMeta, userIds: string[], reason: string) {
    const setting = await this.prisma.accountDeleteSecuritySetting.findUnique({
      where: { id: ACCOUNT_DELETE_PIN_SETTING_ID },
      select: { deletePinHash: true }
    });
    if (!setting) throw new BadRequestException('PIN hapus akun belum diatur. Atur PIN terlebih dahulu.');
    const ok = await bcrypt.compare(pin, setting.deletePinHash);
    if (!ok) {
      await this.prisma.$transaction(async (tx) => {
        await writeAudit(tx, {
          actorId: actor.sub,
          actorRole: actor.role as Role,
          module: 'identity',
          action: 'identity.accounts.delete_pin_failed',
          resource: 'user',
          resourceId: 'bulk-account-delete',
          reason,
          requestIp: meta.requestIp ?? null,
          requestDevice: meta.requestDevice ?? null,
          after: { count: userIds.length, userIds } as Prisma.InputJsonValue
        });
      });
      throw new ForbiddenException('PIN konfirmasi salah.');
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
      authSessions,
      qrCredentials,
      createdQrCredentials,
      revokedQrCredentials,
      teacherLeaves,
      reviewedTeacherLeaves,
      substituteLeaves,
      weeklySchedules,
      prayerAttendances,
      createdPrayerLogs,
      attendanceOverrides,
      createdAttendanceOverrides,
      correctionEventsAsStudent,
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
      this.prisma.authSession.count({ where: { userId } }),
      this.prisma.qrCredential.count({ where: { userId } }),
      this.prisma.qrCredential.count({ where: { createdById: userId } }),
      this.prisma.qrCredential.count({ where: { revokedById: userId } }),
      this.prisma.teacherLeave.count({ where: { teacherId: userId } }),
      this.prisma.teacherLeave.count({ where: { reviewedById: userId } }),
      this.prisma.teacherLeave.count({ where: { substituteTeacherId: userId } }),
      this.prisma.weeklySchedule.count({ where: { teacherId: userId } }),
      this.prisma.prayerAttendanceLog.count({ where: { studentId: userId } }),
      this.prisma.prayerAttendanceLog.count({ where: { createdById: userId } }),
      this.prisma.attendanceOverride.count({ where: { studentId: userId } }),
      this.prisma.attendanceOverride.count({ where: { createdById: userId } }),
      this.prisma.attendanceCorrectionEvent.count({ where: { studentId: userId } }),
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
      authSessions,
      qrCredentials,
      createdQrCredentials,
      revokedQrCredentials,
      teacherLeaves,
      reviewedTeacherLeaves,
      substituteLeaves,
      weeklySchedules,
      prayerAttendances,
      createdPrayerLogs,
      attendanceOverrides,
      createdAttendanceOverrides,
      correctionEventsAsStudent,
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
      authSessions: 'sesi login',
      qrCredentials: 'credential QR',
      createdQrCredentials: 'credential QR dibuat',
      revokedQrCredentials: 'credential QR dicabut',
      teacherLeaves: 'pengajuan izin guru',
      reviewedTeacherLeaves: 'review pengajuan guru',
      substituteLeaves: 'data guru pengganti',
      weeklySchedules: 'jadwal mingguan',
      prayerAttendances: 'riwayat scan mushola',
      createdPrayerLogs: 'scan mushola manual',
      attendanceOverrides: 'override presensi',
      createdAttendanceOverrides: 'override dibuat',
      correctionEventsAsStudent: 'koreksi presensi sebagai siswa',
      correctionEventsAsActor: 'koreksi presensi sebagai pelaku'
    };
    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => `${labels[key] || key}: ${value}`);
  }

  private async accountDeletePreviewItem(target: AccountDeleteTarget, actor: { sub: string; role: string }) {
    const rejectReasons: string[] = [];
    const warnings: string[] = [];
    if (actor.sub === target.id) rejectReasons.push('Anda tidak boleh menghapus akun sendiri.');
    if (target.archivedAt) rejectReasons.push('Akun sudah diarsipkan.');
    if (ACCOUNT_DELETE_SENSITIVE_ROLES.has(target.role)) rejectReasons.push('Role sensitif tidak boleh dihapus dari fitur ini.');
    if (!ACCOUNT_DELETE_TARGET_ROLES.has(target.role)) rejectReasons.push('Role target tidak didukung untuk hapus akun.');
    if (target.role === Role.KEPALA_SEKOLAH) warnings.push('Target Kepala Sekolah: pastikan sudah ada keputusan resmi sebelum melanjutkan.');

    const relationCounts = await this.protectedRelationCounts(target.id);
    const dependencyReasons = this.relationBlockReasons(relationCounts);
    const dependencyCount = Object.values(relationCounts).reduce((sum, value) => sum + value, 0);
    const action: AccountDeleteAction = rejectReasons.length > 0 ? 'REJECT' : dependencyReasons.length > 0 ? 'ARCHIVE' : 'HARD_DELETE';
    return {
      userId: target.id,
      username: target.username,
      fullName: target.fullName,
      role: target.role,
      active: target.active,
      cardStatus: target.cardStatus,
      action,
      dependencyCount,
      dependencyReasons,
      relationCounts,
      rejectReasons,
      warnings
    };
  }

  async previewAccountDelete(payload: PreviewAccountDeleteDto, actor: { sub: string; role: string }) {
    this.assertAccountDeleteActor(actor);
    const userIds = this.normalizeAccountDeleteUserIds(payload.userIds);
    const targets = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, fullName: true, role: true, active: true, cardStatus: true, archivedAt: true }
    });
    const foundIds = new Set(targets.map((target) => target.id));
    const missingIds = userIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) throw new BadRequestException('Sebagian akun tidak ditemukan.');

    const items = await Promise.all(targets.map((target) => this.accountDeletePreviewItem(target, actor)));
    return {
      requestedCount: userIds.length,
      roleDistribution: this.roleDistribution(targets),
      summary: {
        hardDeleteCount: items.filter((item) => item.action === 'HARD_DELETE').length,
        archiveCount: items.filter((item) => item.action === 'ARCHIVE').length,
        rejectedCount: items.filter((item) => item.action === 'REJECT').length
      },
      items: userIds.map((id) => items.find((item) => item.userId === id)!)
    };
  }

  async deleteAccounts(payload: DeleteAccountsDto, actor: { sub: string; role: string }, meta: RequestMeta = {}) {
    this.assertAccountDeleteActor(actor);
    this.assertAccountDeleteRateLimit(actor);
    const userIds = this.normalizeAccountDeleteUserIds(payload.userIds);
    const reason = String(payload.reason || '').trim();
    if (reason.length < 10) throw new BadRequestException('Alasan wajib diisi minimal 10 karakter.');
    if (String(payload.confirmText || '').trim() !== ACCOUNT_DELETE_CONFIRM_TEXT) throw new BadRequestException(`Ketik ${ACCOUNT_DELETE_CONFIRM_TEXT} untuk konfirmasi.`);
    const mode: AccountDeleteMode = payload.mode || 'auto';

    await this.verifyAccountDeletePin(payload.pin, actor, meta, userIds, reason);
    const preview = await this.previewAccountDelete({ userIds }, actor);
    const rejected = preview.items.filter((item) => item.action === 'REJECT');
    if (rejected.length > 0) throw new ForbiddenException('Sebagian target tidak boleh dihapus. Periksa preview terlebih dahulu.');
    if (mode === 'hard-delete-only-if-safe' && preview.items.some((item) => item.action !== 'HARD_DELETE')) {
      throw new ConflictException('Mode hard-delete-only-if-safe menolak akun yang punya dependency. Gunakan archive-only atau auto.');
    }

    const now = new Date();
    const executed = await this.prisma.$transaction(async (tx) => {
      const hardDeleted: string[] = [];
      const archived: string[] = [];
      const revokedSessions: Record<string, number> = {};
      const revokedQrCredentials: Record<string, number> = {};
      const inactiveSmartCards: Record<string, number> = {};

      for (const item of preview.items) {
        const shouldArchive = mode === 'archive-only' || item.action === 'ARCHIVE';
        if (shouldArchive) {
          await tx.user.update({
            where: { id: item.userId },
            data: {
              active: false,
              cardStatus: CardStatus.INACTIVE,
              archivedAt: now,
              archivedById: actor.sub,
              archiveReason: reason,
              deleteMode: 'ARCHIVED_BY_ACCOUNT_DELETE',
              sessionVersion: { increment: 1 }
            }
          });
          const sessions = await tx.authSession.updateMany({ where: { userId: item.userId, revokedAt: null }, data: { revokedAt: now, revokedReason: 'account-archived' } });
          const qr = await tx.qrCredential.updateMany({ where: { userId: item.userId, status: QrCredentialStatus.ACTIVE }, data: { status: QrCredentialStatus.REVOKED, revokedAt: now, revokedById: actor.sub, revokeReason: reason } });
          const cards = await tx.smartCard.updateMany({ where: { userId: item.userId, status: { not: CardStatus.INACTIVE } }, data: { status: CardStatus.INACTIVE } });
          archived.push(item.userId);
          revokedSessions[item.userId] = sessions.count;
          revokedQrCredentials[item.userId] = qr.count;
          inactiveSmartCards[item.userId] = cards.count;
        } else {
          await tx.userTutorialState.deleteMany({ where: { userId: item.userId } });
          await tx.notification.deleteMany({ where: { userId: item.userId } });
          await tx.user.delete({ where: { id: item.userId } });
          hardDeleted.push(item.userId);
        }
      }

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'identity',
        action: 'identity.accounts.delete_executed',
        resource: 'user',
        resourceId: 'bulk-account-delete',
        reason,
        requestIp: meta.requestIp ?? null,
        requestDevice: meta.requestDevice ?? null,
        after: {
          mode,
          count: preview.items.length,
          userIds,
          roleDistribution: preview.roleDistribution,
          hardDeletedCount: hardDeleted.length,
          archivedCount: archived.length,
          rejectedCount: 0,
          hardDeleted,
          archived,
          revokedSessions,
          revokedQrCredentials,
          inactiveSmartCards
        } as Prisma.InputJsonValue
      });

      return { hardDeleted, archived, revokedSessions, revokedQrCredentials, inactiveSmartCards };
    });

    return {
      deletedAt: now.toISOString(),
      mode,
      requestedCount: preview.requestedCount,
      hardDeletedCount: executed.hardDeleted.length,
      archivedCount: executed.archived.length,
      rejectedCount: 0,
      items: preview.items.map((item) => ({ ...item, executedAction: executed.hardDeleted.includes(item.userId) ? 'HARD_DELETE' : 'ARCHIVE' }))
    };
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
