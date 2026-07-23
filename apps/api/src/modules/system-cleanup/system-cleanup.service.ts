import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { CardStatus, NotificationType, ReconciliationFlagType, ReconciliationStatus, Role } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { businessDayBounds } from '../../common/business-time';
import type { RequestMeta } from '../../common/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { PilotCleanupPreviewDto, PilotCleanupRunDto, SystemCleanupRunDto } from './system-cleanup.dto';

type Actor = { sub: string; role: string };
type CleanupOptions = Omit<SystemCleanupRunDto, 'reason'>;

const PROTECTED_DATA = [
  'Catatan audit resmi',
  'Presensi siswa',
  'Absen guru di sesi kelas',
  'Riwayat scan gerbang',
  'Riwayat scan mushola',
  'Override presensi',
  'Sesi/jadwal kelas',
  'Papan anomali',
  'Buku piket'
];
const PILOT_CONFIRM_TEXT = 'BERSIHKAN PILOT';

@Injectable()
export class SystemCleanupService {
  constructor(private readonly prisma: PrismaService) {}

  private assertDeveloper(actor: Actor) {
    if (actor.role !== Role.DEVELOPER) throw new ForbiddenException('Clean data sistem hanya boleh dilakukan Developer.');
  }

  private assertPilotOperator(actor: Actor) {
    if (actor.role !== Role.ADMIN_TU && actor.role !== Role.DEVELOPER) {
      throw new ForbiddenException('Cleanup pilot hanya boleh dilakukan Admin/TU atau Developer.');
    }
  }

  private pilotDate(date: string) {
    try {
      return businessDayBounds(date);
    } catch {
      throw new BadRequestException('Tanggal pilot harus valid dengan format YYYY-MM-DD.');
    }
  }

  private cutoff(days = 30) {
    return new Date(Date.now() - Math.max(1, Number(days) || 30) * 24 * 60 * 60 * 1000);
  }

  private async protectedHistoryCount(userId: string) {
    const counts = await Promise.all([
      this.prisma.session.count({ where: { teacherId: userId } }),
      this.prisma.classEnrollment.count({ where: { studentId: userId } }),
      this.prisma.gateLog.count({ where: { userId } }),
      this.prisma.studentAttendance.count({ where: { studentId: userId } }),
      this.prisma.teacherSessionPresence.count({ where: { teacherId: userId } }),
      this.prisma.reconciliationFlag.count({ where: { OR: [{ userId }, { resolvedById: userId }, { assignedToId: userId }] } }),
      this.prisma.auditEntry.count({ where: { actorId: userId } }),
      this.prisma.teacherLeave.count({ where: { OR: [{ teacherId: userId }, { reviewedById: userId }, { substituteTeacherId: userId }] } }),
      this.prisma.weeklySchedule.count({ where: { teacherId: userId } }),
      this.prisma.prayerAttendanceLog.count({ where: { OR: [{ studentId: userId }, { createdById: userId }] } }),
      this.prisma.attendanceOverride.count({ where: { OR: [{ studentId: userId }, { createdById: userId }] } }),
      this.prisma.attendanceCorrectionEvent.count({ where: { actorId: userId } }),
      this.prisma.picketNote.count({ where: { OR: [{ createdById: userId }, { updatedById: userId }] } }),
      this.prisma.smartCard.count({ where: { userId } })
    ]);
    return counts.reduce((sum, item) => sum + item, 0);
  }

  private async inactiveTestUserCandidates(limit = 50) {
    const users = await this.prisma.user.findMany({
      where: {
        active: false,
        username: { startsWith: 'contract.user.create.' }
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
      select: { id: true, username: true, fullName: true, role: true }
    });
    const safe = [] as typeof users;
    const blocked = [] as Array<(typeof users)[number] & { reason: string }>;
    for (const user of users) {
      const count = await this.protectedHistoryCount(user.id);
      if (count === 0) safe.push(user);
      else blocked.push({ ...user, reason: `Masih punya ${count} relasi/histori penting.` });
    }
    return { safe, blocked };
  }

  async preview(actor: Actor, options: CleanupOptions = {}) {
    this.assertDeveloper(actor);
    const olderThanDays = Number(options.olderThanDays || 30);
    const cutoff = this.cutoff(olderThanDays);
    const inactiveUsers = await this.inactiveTestUserCandidates();
    const [inactiveCards, readNotifications, staleTutorialStates] = await Promise.all([
      this.prisma.smartCard.findMany({
        where: { status: CardStatus.INACTIVE, user: { active: false } },
        take: 50,
        select: { id: true, uid: true, status: true, user: { select: { username: true, fullName: true } } },
        orderBy: { uid: 'asc' }
      }),
      this.prisma.notification.findMany({
        where: { readAt: { not: null }, createdAt: { lt: cutoff } },
        take: 50,
        select: { id: true, title: true, createdAt: true, readAt: true },
        orderBy: { createdAt: 'asc' }
      }),
      this.prisma.userTutorialState.findMany({
        where: { user: { active: false } },
        take: 50,
        select: { id: true, tutorialVersion: true, updatedAt: true, user: { select: { username: true, fullName: true } } },
        orderBy: { updatedAt: 'asc' }
      })
    ]);

    const result = {
      olderThanDays,
      categories: {
        inactiveTestUsers: {
          selected: options.inactiveTestUsers !== false,
          count: inactiveUsers.safe.length,
          sample: inactiveUsers.safe.slice(0, 10),
          skipped: inactiveUsers.blocked.slice(0, 10),
          reason: 'Akun test/contract nonaktif tanpa histori penting boleh dihapus permanen.'
        },
        inactiveUserCards: {
          selected: options.inactiveUserCards !== false,
          count: inactiveCards.length,
          sample: inactiveCards.slice(0, 10),
          reason: 'Kartu nonaktif milik akun nonaktif boleh dibersihkan dari data operasional.'
        },
        readNotifications: {
          selected: options.readNotifications !== false,
          count: readNotifications.length,
          sample: readNotifications.slice(0, 10),
          reason: `Notifikasi yang sudah dibaca dan lebih lama dari ${olderThanDays} hari aman dibersihkan.`
        },
        staleTutorialStates: {
          selected: options.staleTutorialStates !== false,
          count: staleTutorialStates.length,
          sample: staleTutorialStates.slice(0, 10),
          reason: 'Status tutorial milik akun nonaktif bisa dibersihkan.'
        }
      },
      protectedData: PROTECTED_DATA
    };

    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'system_cleanup',
        action: 'system_cleanup.previewed',
        resource: 'systemCleanup',
        resourceId: 'preview',
        after: { counts: Object.fromEntries(Object.entries(result.categories).map(([key, value]) => [key, value.count])), protectedData: PROTECTED_DATA }
      });
    });

    return result;
  }

  async run(actor: Actor, payload: SystemCleanupRunDto) {
    this.assertDeveloper(actor);
    const preview = await this.preview(actor, payload);
    const inactiveUserCandidates = await this.inactiveTestUserCandidates(500);
    const executed: Record<string, number> = {};
    const skipped: Array<{ category: string; reason: string }> = [];
    const cutoff = this.cutoff(payload.olderThanDays || 30);

    await this.prisma.$transaction(async (tx) => {
      if (payload.inactiveUserCards !== false) {
        const result = await tx.smartCard.deleteMany({ where: { status: CardStatus.INACTIVE, user: { active: false } } });
        executed.inactiveUserCards = result.count;
      } else skipped.push({ category: 'inactiveUserCards', reason: 'Tidak dipilih.' });

      if (payload.readNotifications !== false) {
        const result = await tx.notification.deleteMany({ where: { readAt: { not: null }, createdAt: { lt: cutoff } } });
        executed.readNotifications = result.count;
      } else skipped.push({ category: 'readNotifications', reason: 'Tidak dipilih.' });

      if (payload.staleTutorialStates !== false) {
        const result = await tx.userTutorialState.deleteMany({ where: { user: { active: false } } });
        executed.staleTutorialStates = result.count;
      } else skipped.push({ category: 'staleTutorialStates', reason: 'Tidak dipilih.' });

      if (payload.inactiveTestUsers !== false) {
        const ids = inactiveUserCandidates.safe.map((user) => user.id);
        if (ids.length > 0) {
          const result = await tx.user.deleteMany({ where: { id: { in: ids } } });
          executed.inactiveTestUsers = result.count;
        } else {
          executed.inactiveTestUsers = 0;
        }
      } else skipped.push({ category: 'inactiveTestUsers', reason: 'Tidak dipilih.' });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'system_cleanup',
        action: 'system_cleanup.executed',
        resource: 'systemCleanup',
        resourceId: 'run',
        reason: payload.reason,
        after: { executed, skipped, protectedData: PROTECTED_DATA }
      });
    });

    return { ok: true, executed, skipped, protectedData: PROTECTED_DATA };
  }

  async previewPilot(actor: Actor, payload: PilotCleanupPreviewDto) {
    this.assertPilotOperator(actor);
    const { date, start, end, key } = this.pilotDate(payload.date);
    const sessionWhere = { businessDate: date };
    const flagWhere = {
      type: ReconciliationFlagType.TIDAK_MENGAJAR,
      status: ReconciliationStatus.OPEN,
      session: sessionWhere
    };
    const notificationWhere = {
      type: NotificationType.SESSION_MISSED,
      createdAt: { gte: start, lte: end }
    };
    const [sessions, missedSessions, notifications, flags] = await Promise.all([
      this.prisma.session.count({ where: sessionWhere }),
      this.prisma.session.count({ where: { ...sessionWhere, status: 'MISSED' } }),
      this.prisma.notification.count({ where: notificationWhere }),
      this.prisma.reconciliationFlag.count({ where: flagWhere })
    ]);

    return {
      date: key,
      counts: { sessions, missedSessions, notifications, flags },
      actions: {
        notifications: 'DELETE',
        flags: 'RESOLVE',
        sessions: 'PRESERVE',
        attendance: 'PRESERVE',
        scans: 'PRESERVE',
        audit: 'PRESERVE'
      },
      confirmText: PILOT_CONFIRM_TEXT
    };
  }

  async runPilot(actor: Actor, payload: PilotCleanupRunDto, requestMeta: RequestMeta = {}) {
    this.assertPilotOperator(actor);
    const reason = String(payload.reason || '').trim();
    if (reason.length < 10) throw new BadRequestException('Alasan cleanup pilot minimal 10 karakter.');
    if (String(payload.confirmText || '').trim() !== PILOT_CONFIRM_TEXT) {
      throw new BadRequestException(`Ketik ${PILOT_CONFIRM_TEXT} untuk konfirmasi.`);
    }
    const preview = await this.previewPilot(actor, payload);
    const { date, start, end, key } = this.pilotDate(payload.date);
    const resolvedAt = new Date();

    const executed = await this.prisma.$transaction(async (tx) => {
      const flags = await tx.reconciliationFlag.findMany({
        where: {
          type: ReconciliationFlagType.TIDAK_MENGAJAR,
          status: ReconciliationStatus.OPEN,
          session: { businessDate: date }
        },
        select: { id: true }
      });
      const flagIds = flags.map((flag) => flag.id);
      const closedEscalations = flagIds.length > 0
        ? await tx.reconciliationEscalation.updateMany({
          where: { flagId: { in: flagIds }, status: 'QUEUED' },
          data: { status: 'CLOSED', closedAt: resolvedAt, closedById: actor.sub }
        })
        : { count: 0 };
      const resolvedFlags = flagIds.length > 0
        ? await tx.reconciliationFlag.updateMany({
          where: { id: { in: flagIds }, status: ReconciliationStatus.OPEN },
          data: {
            status: ReconciliationStatus.RESOLVED,
            reviewStatus: 'RESOLVED',
            resolvedAt,
            resolvedById: actor.sub,
            resolvedReason: reason
          }
        })
        : { count: 0 };
      const deletedNotifications = await tx.notification.deleteMany({
        where: {
          type: NotificationType.SESSION_MISSED,
          createdAt: { gte: start, lte: end }
        }
      });

      const result = {
        deletedNotifications: deletedNotifications.count,
        resolvedFlags: resolvedFlags.count,
        closedEscalations: closedEscalations.count
      };
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'system_cleanup',
        action: 'system_cleanup.pilot_executed',
        resource: 'pilotData',
        resourceId: key,
        reason,
        requestIp: requestMeta.requestIp ?? null,
        requestDevice: requestMeta.requestDevice ?? null,
        before: preview.counts,
        after: { ...result, preserved: preview.actions }
      });
      return result;
    });

    return { ok: true, date: key, executed, preserved: preview.actions };
  }
}
