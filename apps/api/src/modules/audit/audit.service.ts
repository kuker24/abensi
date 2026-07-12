import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { businessDayBounds } from '../../common/business-time';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import {
  ACTIVE_TRUSTED_STATUS,
  AUDIT_TRUST_BOUNDARY_MARKER,
  HISTORICAL_UNTRUSTED_STATUS,
  TRUSTED_STATUS,
  type AuditTrustClassification
} from '../security/audit-trust-boundary.core';
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

type TrustMetadata = {
  epochs: Array<{ epochNumber: number; startSequence: bigint; endSequence: bigint | null; status: string }>;
  incidents: Array<{ historicalStartSequence: bigint; historicalEndSequence: bigint; status: string }>;
};

function trustMetadataForSequence(sequence: bigint | number | string | null | undefined, metadata: TrustMetadata) {
  if (sequence === null || sequence === undefined) {
    return { trustClassification: 'INVALID_UNEXPECTED' as AuditTrustClassification, epochNumber: null, isBoundaryMarker: false };
  }
  const current = BigInt(sequence);
  const metadataIsAbsent = metadata.epochs.length === 0 && metadata.incidents.length === 0;
  if (metadataIsAbsent) {
    return { trustClassification: 'LEGACY_METADATA_PENDING' as AuditTrustClassification, epochNumber: null, isBoundaryMarker: false };
  }
  const incident = metadata.incidents.find((item) =>
    item.status === HISTORICAL_UNTRUSTED_STATUS && current >= item.historicalStartSequence && current <= item.historicalEndSequence
  );
  if (incident) {
    return { trustClassification: 'DECLARED_HISTORICAL_UNTRUSTED' as AuditTrustClassification, epochNumber: null, isBoundaryMarker: false };
  }
  const epoch = metadata.epochs.find((item) =>
    (item.status === TRUSTED_STATUS || item.status === ACTIVE_TRUSTED_STATUS) &&
    current >= item.startSequence &&
    (item.endSequence === null || current <= item.endSequence)
  );
  if (!epoch) {
    return { trustClassification: 'INVALID_UNEXPECTED' as AuditTrustClassification, epochNumber: null, isBoundaryMarker: false };
  }
  const isBoundaryMarker = current === epoch.startSequence && epoch.epochNumber > 1;
  return {
    trustClassification: (isBoundaryMarker ? 'BOUNDARY_MARKER' : 'DECLARED_TRUSTED_EPOCH') as AuditTrustClassification,
    epochNumber: epoch.epochNumber,
    isBoundaryMarker
  };
}

function serializeAuditEntry(entry: any, metadata: TrustMetadata) {
  const trust = trustMetadataForSequence(entry.sequence, metadata);
  const isBoundaryMarker = trust.isBoundaryMarker && entry.action === 'audit.trust_boundary.approved';
  return {
    id: entry.id,
    sequence: entry.sequence != null ? entry.sequence.toString() : null,
    actorId: entry.actorId ?? null,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    module: entry.module ?? null,
    resource: entry.resource,
    resourceId: entry.resourceId,
    reason: entry.reason ?? null,
    requestIp: entry.requestIp ?? null,
    requestDevice: entry.requestDevice ?? null,
    hashVersion: entry.hashVersion,
    createdAt: entry.createdAt,
    actor: entry.actor ?? null,
    before: isBoundaryMarker ? null : serializeJsonSafe(entry.before),
    after: isBoundaryMarker ? { marker: AUDIT_TRUST_BOUNDARY_MARKER } : serializeJsonSafe(entry.after),
    trustClassification: trust.trustClassification,
    epochNumber: trust.epochNumber,
    isBoundaryMarker
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
    const [epochs, incidents] = await Promise.all([
      this.prisma.auditChainEpoch.findMany({
        select: { epochNumber: true, startSequence: true, endSequence: true, status: true },
        orderBy: { epochNumber: 'asc' }
      }),
      this.prisma.auditIntegrityIncident.findMany({
        select: { historicalStartSequence: true, historicalEndSequence: true, status: true },
        orderBy: { historicalStartSequence: 'asc' }
      })
    ]);
    const metadata: TrustMetadata = { epochs, incidents };

    return {
      items: items.map((item) => serializeAuditEntry(item, metadata)),
      meta: buildPaginationMeta(total, pagination)
    };
  }
}
