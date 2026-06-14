import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { canonicalJson } from '../apps/api/src/modules/security/canonical-json';

function argValue(name: string, fallback: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hashEntry(prevHash: string | null | undefined, canonicalPayload: unknown) {
  return createHash('sha256')
    .update(prevHash || 'GENESIS')
    .update(canonicalJson(canonicalPayload))
    .digest('hex');
}

async function main() {
  const prisma = new PrismaClient();
  const outputPath = resolve(argValue('--json', 'artifacts/audit/audit-chain-preflight.json'));
  const [entries, state] = await Promise.all([
    prisma.auditEntry.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    prisma.auditChainState.findUnique({ where: { id: 1 } })
  ]);

  const errors: string[] = [];
  const warnings: string[] = [];
  const hashOwners = new Map<string, string[]>();
  const childrenByPrev = new Map<string, string[]>();
  const byHash = new Map<string, typeof entries[number]>();

  for (const entry of entries) {
    if (entry.hashVersion !== 1) errors.push(`Unsupported hashVersion at ${entry.id}: ${entry.hashVersion}`);
    if (!entry.canonicalPayload) errors.push(`Missing canonicalPayload at ${entry.id}`);
    if (!entry.entryHash) errors.push(`Missing entryHash at ${entry.id}`);
    if (entry.entryHash) {
      hashOwners.set(entry.entryHash, [...(hashOwners.get(entry.entryHash) ?? []), entry.id]);
      byHash.set(entry.entryHash, entry);
    }
    const prevKey = entry.prevHash ?? 'GENESIS';
    childrenByPrev.set(prevKey, [...(childrenByPrev.get(prevKey) ?? []), entry.id]);

    if (entry.entryHash && entry.canonicalPayload) {
      const expected = hashEntry(entry.prevHash, entry.canonicalPayload);
      if (entry.entryHash !== expected) {
        errors.push(`Cryptographic hash mismatch at ${entry.id}: expected ${expected}, got ${entry.entryHash}`);
      }
    }
  }

  for (const [hash, owners] of hashOwners) {
    if (owners.length > 1) errors.push(`Duplicate entryHash ${hash} owned by ${owners.join(', ')}`);
  }

  const genesis = entries.filter((entry) => !entry.prevHash);
  if (entries.length > 0 && genesis.length !== 1) errors.push(`Expected exactly one genesis entry, found ${genesis.length}`);

  for (const entry of entries) {
    if (entry.prevHash && !byHash.has(entry.prevHash)) errors.push(`Orphan prevHash at ${entry.id}: ${entry.prevHash}`);
  }

  for (const [prevHash, children] of childrenByPrev) {
    if (children.length > 1) errors.push(`Branch detected at ${prevHash}: children ${children.join(', ')}`);
  }

  const visited = new Set<string>();
  if (genesis.length === 1) {
    let cursor = genesis[0];
    while (cursor) {
      if (visited.has(cursor.id)) {
        errors.push(`Cycle detected at ${cursor.id}`);
        break;
      }
      visited.add(cursor.id);
      const children = childrenByPrev.get(cursor.entryHash ?? '') ?? [];
      if (children.length === 0) break;
      if (children.length > 1) break;
      const nextId = children[0];
      cursor = entries.find((entry) => entry.id === nextId)!;
    }
  }

  if (visited.size !== entries.length) {
    const disconnected = entries.filter((entry) => !visited.has(entry.id)).map((entry) => entry.id);
    if (disconnected.length) errors.push(`Disconnected audit component(s): ${disconnected.join(', ')}`);
  }

  const lastBySequence = [...entries].sort((a, b) => {
    const sequenceDiff = Number((a.sequence ?? 0n) - (b.sequence ?? 0n));
    if (sequenceDiff !== 0) return sequenceDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  }).at(-1);

  if (entries.length > 0) {
    if (!state) errors.push('AuditChainState id=1 is missing');
    if (state && lastBySequence) {
      if (state.lastSequence !== lastBySequence.sequence) errors.push(`AuditChainState.lastSequence mismatch: expected ${lastBySequence.sequence}, got ${state.lastSequence}`);
      if (state.lastHash !== lastBySequence.entryHash) errors.push(`AuditChainState.lastHash mismatch: expected ${lastBySequence.entryHash}, got ${state.lastHash}`);
      if (state.lastEntryId !== lastBySequence.id) errors.push(`AuditChainState.lastEntryId mismatch: expected ${lastBySequence.id}, got ${state.lastEntryId}`);
    }
  } else if (state && state.lastSequence !== 0n) {
    errors.push(`Empty audit chain but AuditChainState.lastSequence is ${state.lastSequence}`);
  }

  if (entries.some((entry) => !entry.canonicalPayload || !entry.entryHash)) {
    warnings.push('Legacy boundary required: at least one entry is missing canonicalPayload or entryHash and cannot be cryptographically verified. Do not resequence automatically.');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    state: state ? { lastSequence: state.lastSequence.toString(), lastHash: state.lastHash, lastEntryId: state.lastEntryId } : null,
    errors,
    warnings,
    ok: errors.length === 0
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  await prisma.$disconnect();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
