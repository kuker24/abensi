import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    pagination: PaginationQuery,
    filters: {
      actorId?: string;
      from?: string;
      to?: string;
      module?: string;
      action?: string;
    }
  ) {
    const where: Prisma.AuditEntryWhereInput = {};
    if (filters.actorId) {
      where.actorId = filters.actorId;
    }
    if (filters.module) {
      where.module = filters.module;
    }
    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.from || filters.to) {
      const createdAtFilter: Prisma.DateTimeFilter = {};
      if (filters.from) {
        const start = new Date(filters.from);
        if (!Number.isNaN(start.getTime())) {
          createdAtFilter.gte = start;
        }
      }
      if (filters.to) {
        const end = new Date(filters.to);
        if (!Number.isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          createdAtFilter.lte = end;
        }
      }
      where.createdAt = createdAtFilter;
    }

    const [total, items] = await Promise.all([
      this.prisma.auditEntry.count({ where }),
      this.prisma.auditEntry.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          actor: {
            select: {
              id: true,
              fullName: true,
              username: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }
}
