import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';

export const ACTIVE_TUTORIAL_VERSION = '2026.04.26';

type Actor = { sub: string; role: string };

function newestDate(...values: Array<Date | null | undefined>) {
  const valid = values.filter(Boolean) as Date[];
  if (!valid.length) return null;
  return valid.reduce((latest, item) => (item.getTime() > latest.getTime() ? item : latest), valid[0]);
}

function shouldShowTutorial(state: any | null, version = ACTIVE_TUTORIAL_VERSION) {
  if (!state) return true;
  const closedAt = newestDate(state.completedAt, state.dismissedAt);
  const forcedAfterClose = Boolean(state.forceShowAt && (!closedAt || state.forceShowAt.getTime() > closedAt.getTime()));
  const versionChanged = state.tutorialVersion !== version;
  const neverClosed = !state.completedAt && !state.dismissedAt;
  return versionChanged || neverClosed || forcedAfterClose;
}

@Injectable()
export class TutorialsService {
  constructor(private readonly prisma: PrismaService) {}

  private audit(payload: Parameters<typeof writeAudit>[1]) {
    return this.prisma.$transaction(async (tx) => writeAudit(tx, payload));
  }

  async getMyTutorial(actor: Actor) {
    const state = await this.prisma.userTutorialState.findUnique({
      where: { userId: actor.sub },
      include: { forceShowBy: { select: { id: true, fullName: true, username: true, role: true } } }
    });

    const shouldShow = shouldShowTutorial(state);
    const now = new Date();

    const saved = await this.prisma.userTutorialState.upsert({
      where: { userId: actor.sub },
      update: {
        tutorialVersion: ACTIVE_TUTORIAL_VERSION,
        ...(state?.tutorialVersion !== ACTIVE_TUTORIAL_VERSION ? { completedAt: null, dismissedAt: null } : {}),
        lastSeenAt: shouldShow ? now : state?.lastSeenAt ?? now
      },
      create: {
        userId: actor.sub,
        tutorialVersion: ACTIVE_TUTORIAL_VERSION,
        lastSeenAt: shouldShow ? now : null
      },
      include: { forceShowBy: { select: { id: true, fullName: true, username: true, role: true } } }
    });

    if (shouldShow && (!state || !state.lastSeenAt || (state.forceShowAt && (!state.completedAt || state.forceShowAt > state.completedAt)))) {
      await this.audit({
        actorId: actor.sub,
        actorRole: actor.role as Role,
        module: 'tutorial',
        action: 'tutorial.shown',
        resource: 'userTutorialState',
        resourceId: saved.id,
        after: { userId: actor.sub, version: ACTIVE_TUTORIAL_VERSION, forced: Boolean(saved.forceShowAt) }
      });
    }

    return {
      version: ACTIVE_TUTORIAL_VERSION,
      shouldShow,
      state: saved,
      forcedBy: saved.forceShowBy ?? null
    };
  }

  async completeMyTutorial(actor: Actor, version = ACTIVE_TUTORIAL_VERSION) {
    const now = new Date();
    const state = await this.prisma.userTutorialState.upsert({
      where: { userId: actor.sub },
      update: { tutorialVersion: version || ACTIVE_TUTORIAL_VERSION, completedAt: now, dismissedAt: null, lastSeenAt: now },
      create: { userId: actor.sub, tutorialVersion: version || ACTIVE_TUTORIAL_VERSION, completedAt: now, lastSeenAt: now }
    });

    await this.audit({
      actorId: actor.sub,
      actorRole: actor.role as Role,
      module: 'tutorial',
      action: 'tutorial.completed',
      resource: 'userTutorialState',
      resourceId: state.id,
      after: { userId: actor.sub, version: state.tutorialVersion }
    });

    return { ok: true, version: state.tutorialVersion, shouldShow: false };
  }

  async dismissMyTutorial(actor: Actor, version = ACTIVE_TUTORIAL_VERSION) {
    const now = new Date();
    const state = await this.prisma.userTutorialState.upsert({
      where: { userId: actor.sub },
      update: { tutorialVersion: version || ACTIVE_TUTORIAL_VERSION, dismissedAt: now, lastSeenAt: now },
      create: { userId: actor.sub, tutorialVersion: version || ACTIVE_TUTORIAL_VERSION, dismissedAt: now, lastSeenAt: now }
    });

    await this.audit({
      actorId: actor.sub,
      actorRole: actor.role as Role,
      module: 'tutorial',
      action: 'tutorial.dismissed',
      resource: 'userTutorialState',
      resourceId: state.id,
      after: { userId: actor.sub, version: state.tutorialVersion }
    });

    return { ok: true, version: state.tutorialVersion, shouldShow: false };
  }

  async listUserTutorials(pagination: PaginationQuery, filters: { role?: Role; search?: string }) {
    const where: Prisma.UserWhereInput = {
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.search
        ? {
            OR: [
              { fullName: { contains: filters.search, mode: 'insensitive' } },
              { username: { contains: filters.search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          active: true,
          tutorialState: {
            include: { forceShowBy: { select: { id: true, fullName: true, username: true, role: true } } }
          }
        }
      })
    ]);

    return {
      items: items.map((user) => ({
        ...user,
        tutorial: {
          version: user.tutorialState?.tutorialVersion ?? ACTIVE_TUTORIAL_VERSION,
          shouldShow: shouldShowTutorial(user.tutorialState),
          completedAt: user.tutorialState?.completedAt ?? null,
          dismissedAt: user.tutorialState?.dismissedAt ?? null,
          forceShowAt: user.tutorialState?.forceShowAt ?? null,
          forceShowBy: user.tutorialState?.forceShowBy ?? null,
          lastSeenAt: user.tutorialState?.lastSeenAt ?? null
        },
        tutorialState: undefined
      })),
      meta: buildPaginationMeta(total, pagination)
    };
  }

  async activateForUser(userId: string, actor: Actor, reason?: string, version = ACTIVE_TUTORIAL_VERSION) {
    if (actor.role !== Role.DEVELOPER) throw new ForbiddenException('Hanya developer yang boleh mengaktifkan ulang tutorial.');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, username: true, role: true, active: true } });
    if (!user) throw new NotFoundException('Pengguna tidak ditemukan.');
    const now = new Date();
    const state = await this.prisma.userTutorialState.upsert({
      where: { userId },
      update: { tutorialVersion: version || ACTIVE_TUTORIAL_VERSION, forceShowAt: now, forceShowById: actor.sub, dismissedAt: null },
      create: { userId, tutorialVersion: version || ACTIVE_TUTORIAL_VERSION, forceShowAt: now, forceShowById: actor.sub }
    });

    await this.audit({
      actorId: actor.sub,
      actorRole: actor.role as Role,
      module: 'tutorial',
      action: 'tutorial.activated_for_user',
      resource: 'userTutorialState',
      resourceId: state.id,
      reason: reason ?? 'Developer mengaktifkan tutorial ulang untuk pengguna.',
      after: { targetUserId: user.id, targetUsername: user.username, targetRole: user.role, version: state.tutorialVersion }
    });

    return { ok: true, user, tutorial: { shouldShow: true, forceShowAt: state.forceShowAt, version: state.tutorialVersion } };
  }

  async activateForRole(role: Role, actor: Actor, reason?: string, version = ACTIVE_TUTORIAL_VERSION) {
    if (actor.role !== Role.DEVELOPER) throw new ForbiddenException('Hanya developer yang boleh mengaktifkan tutorial per peran.');
    const users = await this.prisma.user.findMany({ where: { role, active: true }, select: { id: true, username: true } });
    const now = new Date();
    for (const user of users) {
      await this.prisma.userTutorialState.upsert({
        where: { userId: user.id },
        update: { tutorialVersion: version || ACTIVE_TUTORIAL_VERSION, forceShowAt: now, forceShowById: actor.sub, dismissedAt: null },
        create: { userId: user.id, tutorialVersion: version || ACTIVE_TUTORIAL_VERSION, forceShowAt: now, forceShowById: actor.sub }
      });
    }

    await this.audit({
      actorId: actor.sub,
      actorRole: actor.role as Role,
      module: 'tutorial',
      action: 'tutorial.activated_for_role',
      resource: 'userTutorialState',
      resourceId: `role:${role}`,
      reason: reason ?? `Developer mengaktifkan tutorial untuk peran ${role}.`,
      after: { targetRole: role, count: users.length, version: version || ACTIVE_TUTORIAL_VERSION }
    });

    return { ok: true, role, activatedCount: users.length };
  }
}
