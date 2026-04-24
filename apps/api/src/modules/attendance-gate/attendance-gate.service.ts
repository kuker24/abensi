import { Injectable } from '@nestjs/common';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { TapGateDto } from './attendance-gate.dto';

@Injectable()
export class AttendanceGateService {
  constructor(private readonly prisma: PrismaService) {}

  async listLogs(pagination: PaginationQuery, date?: string, userId?: string) {
    const where: Record<string, unknown> = {};

    if (date) {
      const day = new Date(date);
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);
      where.tappedAt = { gte: start, lte: end };
    }

    if (userId) where.userId = userId;

    const [total, items] = await Promise.all([
      this.prisma.gateLog.count({ where }),
      this.prisma.gateLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, username: true, role: true } }
        },
        orderBy: { tappedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }

  tap(payload: TapGateDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const log = await tx.gateLog.create({
        data: {
          userId: payload.userId,
          direction: payload.direction,
          deviceId: payload.deviceId,
          tappedAt: payload.tappedAt ? new Date(payload.tappedAt) : new Date()
        }
      });

      await tx.auditEntry.create({
        data: {
          actorId,
          module: 'attendance',
          action: 'gate.tap.recorded',
          resource: 'gateLog',
          resourceId: log.id,
          after: log
        }
      });

      return log;
    });
  }
}
