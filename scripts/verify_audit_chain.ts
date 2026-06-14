import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../apps/api/src/modules/security/canonical-json';

const prisma = new PrismaClient();

function hashEntry(prevHash: string | null | undefined, canonicalPayload: unknown) {
  return createHash('sha256')
    .update(prevHash || 'GENESIS')
    .update(canonicalJson(canonicalPayload))
    .digest('hex');
}

async function main() {
  const [entries, state] = await Promise.all([
    prisma.auditEntry.findMany({ orderBy: { sequence: 'asc' } }),
    prisma.auditChainState.findUnique({ where: { id: 1 } })
  ]);

  const errors: string[] = [];
  let expectedSequence = 1n;
  let previousHash: string | null = null;
  const prevHashUses = new Map<string, number>();
  const hashOwners = new Map<string, string[]>();

  for (const entry of entries) {
    if (!entry.entryHash) {
      errors.push(`Missing entryHash at audit ${entry.id}`);
    } else {
      hashOwners.set(entry.entryHash, [...(hashOwners.get(entry.entryHash) ?? []), entry.id]);
    }
  }

  for (const [entryHash, owners] of hashOwners) {
    if (owners.length > 1) errors.push(`Duplicate entryHash ${entryHash} on entries ${owners.join(', ')}`);
  }

  for (const entry of entries) {
    if (entry.sequence !== expectedSequence) {
      errors.push(`Sequence gap at audit ${entry.id}: expected ${expectedSequence}, got ${entry.sequence}`);
      expectedSequence = entry.sequence;
    }

    if (entry.prevHash !== previousHash) {
      errors.push(`prevHash mismatch at sequence ${entry.sequence}: expected ${previousHash ?? 'GENESIS'}, got ${entry.prevHash ?? 'GENESIS'}`);
    }

    if (entry.hashVersion !== 1) {
      errors.push(`Unsupported hashVersion at sequence ${entry.sequence}: ${entry.hashVersion}`);
    }

    if (entry.prevHash && !hashOwners.has(entry.prevHash)) {
      errors.push(`Orphan prevHash at sequence ${entry.sequence}: ${entry.prevHash}`);
    }

    if (!entry.canonicalPayload) {
      errors.push(`Missing canonicalPayload at sequence ${entry.sequence}`);
    } else {
      const recalculated = hashEntry(entry.prevHash, entry.canonicalPayload);
      if (entry.entryHash !== recalculated) {
        errors.push(`entryHash mismatch at sequence ${entry.sequence}: expected ${recalculated}, got ${entry.entryHash}`);
      }
    }

    const prevKey = entry.prevHash ?? 'GENESIS';
    prevHashUses.set(prevKey, (prevHashUses.get(prevKey) ?? 0) + 1);
    previousHash = entry.entryHash;
    expectedSequence += 1n;
  }

  const genesisUses = prevHashUses.get('GENESIS') ?? 0;
  if (entries.length > 0 && genesisUses !== 1) {
    errors.push(`Expected exactly one GENESIS prevHash, found ${genesisUses}`);
  }
  for (const [prevHash, count] of prevHashUses) {
    if (prevHash !== 'GENESIS' && count > 1) {
      errors.push(`Branch detected: prevHash ${prevHash} is used by ${count} entries`);
    }
  }

  const last = entries.at(-1);
  if (entries.length > 0) {
    if (!state) errors.push('AuditChainState id=1 is missing');
    if (state && state.lastSequence !== last!.sequence) errors.push(`AuditChainState.lastSequence mismatch: expected ${last!.sequence}, got ${state.lastSequence}`);
    if (state && state.lastHash !== last!.entryHash) errors.push(`AuditChainState.lastHash mismatch: expected ${last!.entryHash}, got ${state.lastHash}`);
    if (state && state.lastEntryId !== last!.id) errors.push(`AuditChainState.lastEntryId mismatch: expected ${last!.id}, got ${state.lastEntryId}`);
  } else if (state && state.lastSequence !== 0n) {
    errors.push(`Empty audit chain but AuditChainState.lastSequence is ${state.lastSequence}`);
  }

  if (errors.length > 0) {
    console.error('Audit chain verification FAILED');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Audit chain verification PASS: ${entries.length} entries verified.`);
}

main()
  .catch((error) => {
    console.error('Audit chain verification ERROR');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
