import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { canonicalJson, canonicalize } from './canonical-json';

export function hashAuditEntry(prevHash: string | null | undefined, canonicalPayload: unknown) {
  return createHash('sha256')
    .update(prevHash || 'GENESIS')
    .update(canonicalJson(canonicalPayload))
    .digest('hex');
}

@Injectable()
export class AuditChainService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(limit = 10000) {
    const entries = await this.prisma.auditEntry.findMany({ orderBy: { createdAt: 'asc' }, take: Math.max(1, Math.min(limit, 100000)) });
    let prevHash: string | null = null;
    let chainStarted = false;
    let legacySkipped = 0;
    let checked = 0;
    const broken: Array<{ id: string; expected: string; actual: string | null }> = [];

    for (const entry of entries) {
      if (!entry.entryHash || !entry.canonicalPayload) {
        if (!chainStarted) {
          legacySkipped += 1;
          continue;
        }
        broken.push({ id: entry.id, expected: 'hash-chain-present', actual: entry.entryHash ?? null });
        continue;
      }

      chainStarted = true;
      checked += 1;
      const expected = hashAuditEntry(prevHash, canonicalize(entry.canonicalPayload));
      if (entry.prevHash !== prevHash || entry.entryHash !== expected) {
        broken.push({ id: entry.id, expected, actual: entry.entryHash });
      }
      prevHash = entry.entryHash;
    }

    return {
      ok: broken.length === 0,
      checked,
      totalScanned: entries.length,
      legacySkipped,
      brokenCount: broken.length,
      broken: broken.slice(0, 50),
      lastHash: prevHash
    };
  }
}
