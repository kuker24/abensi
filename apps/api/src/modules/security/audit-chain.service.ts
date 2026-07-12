import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  hashAuditEntry,
  toSanitizedAuditTrustBoundarySummary,
  verifyAuditTrustBoundary,
  type AuditTrustBoundaryVerification
} from './audit-trust-boundary.core';

export { hashAuditEntry } from './audit-trust-boundary.core';

@Injectable()
export class AuditChainService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(): Promise<AuditTrustBoundaryVerification> {
    const [entries, state, epochs, incidents] = await Promise.all([
      this.prisma.auditEntry.findMany({ orderBy: { sequence: 'asc' } }),
      this.prisma.auditChainState.findUnique({ where: { id: 1 } }),
      this.prisma.auditChainEpoch.findMany({ orderBy: { epochNumber: 'asc' } }),
      this.prisma.auditIntegrityIncident.findMany({ orderBy: { createdAt: 'asc' } })
    ]);

    return verifyAuditTrustBoundary({ entries, state, epochs, incidents });
  }

  async integritySummary() {
    const verified = await this.verify();
    return toSanitizedAuditTrustBoundarySummary(verified);
  }
}
