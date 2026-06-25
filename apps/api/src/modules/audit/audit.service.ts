import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { businessDayBounds } from '../../common/business-time';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';

function serializeJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeJsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serializeJsonSafe(item)])
    );
  }
  return value;
}

function serializeAuditEntry(entry: any) {
  return {
    ...entry,
    sequence: entry.sequence != null ? entry.sequence.toString() : null,
    actor: entry.actor ?? null,
    before: serializeJsonSafe(entry.before),
    after: serializeJsonSafe(entry.after),
    canonicalPayload: serializeJsonSafe(entry.canonicalPayload)
  };
}

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
        try {
          createdAtFilter.gte = businessDayBounds(filters.from).start;
        } catch {
          // Ignore invalid optional filters to preserve existing API behavior.
        }
      }
      if (filters.to) {
        try {
          createdAtFilter.lte = businessDayBounds(filters.to).end;
        } catch {
          // Ignore invalid optional filters to preserve existing API behavior.
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
      items: items.map(serializeAuditEntry),
      meta: buildPaginationMeta(total, pagination)
    };
  }
}
