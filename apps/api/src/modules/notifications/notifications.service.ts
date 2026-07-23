import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Role, type Prisma } from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';

interface NotifyPayload {
  userId?: string | null;
  role?: Role | null;
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(user: { sub: string; role: Role | string }, pagination: PaginationQuery, unreadOnly = false) {
    const where: Prisma.NotificationWhereInput = {
      OR: [
        { userId: user.sub },
        { role: user.role as Role },
        { userId: null, role: null }
      ],
      ...(unreadOnly ? { readAt: null } : {})
    };

    const [total, items, unreadCount] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      }),
      this.prisma.notification.count({
        where: {
          OR: [{ userId: user.sub }, { role: user.role as Role }, { userId: null, role: null }],
          readAt: null
        }
      })
    ]);

    return { items, unreadCount, meta: buildPaginationMeta(total, pagination) };
  }

  async markRead(id: string, user: { sub: string; role: Role | string }) {
    const visibleToUser: Prisma.NotificationWhereInput = {
      id,
      OR: [{ userId: user.sub }, { role: user.role as Role }, { userId: null, role: null }]
    };
    const result = await this.prisma.notification.updateMany({
      where: visibleToUser,
      data: { readAt: new Date() }
    });
    if (result.count !== 1) throw new NotFoundException('Notifikasi tidak ditemukan.');
    return this.prisma.notification.findFirstOrThrow({ where: visibleToUser });
  }

  async create(payload: NotifyPayload) {
    return this.prisma.notification.create({
      data: {
        userId: payload.userId ?? null,
        role: payload.role ?? null,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        href: payload.href ?? null
      }
    });
  }

  async notifyRoles(roles: Role[], payload: Omit<NotifyPayload, 'role' | 'userId'>) {
    if (roles.length === 0) return { created: 0 };
    await this.prisma.notification.createMany({
      data: roles.map((role) => ({
        role,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        href: payload.href ?? null
      }))
    });
    return { created: roles.length };
  }
}
