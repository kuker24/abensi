import { Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import { canonicalJson, canonicalize } from '../modules/security/canonical-json';

type AuditClient = {
  $queryRawUnsafe?: (query: string) => Promise<unknown>;
  $executeRawUnsafe?: (query: string) => Promise<unknown>;
  $transaction?: unknown;
  auditEntry: {
    create: (args: { data: Prisma.AuditEntryUncheckedCreateInput }) => Promise<unknown>;
    findMany?: (args: { where?: Prisma.AuditEntryWhereInput; orderBy?: Prisma.AuditEntryOrderByWithRelationInput | Prisma.AuditEntryOrderByWithRelationInput[]; take?: number }) => Promise<Array<{ id: string; sequence?: bigint | number | null; entryHash: string | null; createdAt: Date }>>;
  };
  auditChainState?: {
    findUnique: (args: { where: { id: number } }) => Promise<{ id: number; lastSequence?: bigint | number | null; lastHash: string | null; lastEntryId: string | null } | null>;
    upsert: (args: {
      where: { id: number };
      update: { lastSequence: bigint; lastHash: string | null; lastEntryId: string | null };
      create: { id: number; lastSequence: bigint; lastHash: string | null; lastEntryId: string | null };
    }) => Promise<unknown>;
  };
};

export interface AuditLogInput {
  action: string;
  resource: string;
  resourceId: string;
  actorId?: string | null;
  actorRole?: Role | null;
  module?: string | null;
  reason?: string | null;
  requestIp?: string | null;
  requestDevice?: string | null;
  before?: unknown | null;
  after?: unknown | null;
}

function inferModule(action: string, module?: string | null) {
  if (module) return module;
  const [first] = action.split('.');
  return first || 'system';
}

function normalizeJson(value: unknown | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function hashEntry(prevHash: string | null | undefined, canonicalPayload: unknown) {
  return createHash('sha256')
    .update(prevHash || 'GENESIS')
    .update(canonicalJson(canonicalPayload))
    .digest('hex');
}

async function resolvePreviousState(client: AuditClient) {
  if (client.auditChainState) {
    const state = await client.auditChainState.findUnique({ where: { id: 1 } });
    const lastSequence = BigInt(state?.lastSequence ?? 0);
    return { lastSequence, nextSequence: lastSequence + 1n, prevHash: state?.lastHash ?? null, lastEntryId: state?.lastEntryId ?? null };
  }

  const latest = client.auditEntry.findMany
    ? await client.auditEntry.findMany({ orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }], take: 1 })
    : [];
  const lastSequence = BigInt(latest[0]?.sequence ?? 0);
  return { lastSequence, nextSequence: lastSequence + 1n, prevHash: latest[0]?.entryHash ?? null, lastEntryId: latest[0]?.id ?? null };
}

function normalizeActorForAudit(payload: AuditLogInput) {
  const actorId = payload.actorId ?? null;
  const isSyntheticActor = Boolean(actorId && /^(reader|worker|system):/.test(actorId));
  return {
    actorId: isSyntheticActor ? null : actorId,
    requestDevice: payload.requestDevice ?? (isSyntheticActor ? actorId : null)
  };
}

async function lockAuditChain(client: AuditClient) {
  if (client.$executeRawUnsafe) {
    await client.$executeRawUnsafe('SELECT pg_advisory_xact_lock(389551911)');
    return;
  }
  if (client.$queryRawUnsafe) {
    await client.$queryRawUnsafe('SELECT pg_advisory_xact_lock(389551911) IS NULL AS locked');
  }
}

function assertTransactionClient(client: AuditClient) {
  const strictGuard = process.env.NODE_ENV !== 'test' || process.env.AUDIT_STRICT_ROOT_GUARD === 'true';
  if (strictGuard && client.$transaction) {
    throw new Error('writeAudit() requires an interactive Prisma transaction client. Use prisma.$transaction/auditedTransaction and pass tx, not the root Prisma client.');
  }
}

export async function auditedTransaction<T>(prisma: { $transaction: (callback: (tx: AuditClient) => Promise<T>) => Promise<T> }, callback: (ctx: { tx: AuditClient; audit: { write: (payload: AuditLogInput) => Promise<unknown> } }) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await lockAuditChain(tx);
    const audit = { write: (payload: AuditLogInput) => writeAudit(tx, payload, { lockAlreadyHeld: true }) };
    return callback({ tx, audit });
  });
}

export async function writeAudit(client: AuditClient, payload: AuditLogInput, options: { lockAlreadyHeld?: boolean } = {}) {
  assertTransactionClient(client);
  if (!options.lockAlreadyHeld) await lockAuditChain(client);
  const module = inferModule(payload.action, payload.module);
  const before = normalizeJson(payload.before);
  const after = normalizeJson(payload.after);
  const { actorId, requestDevice } = normalizeActorForAudit(payload);
  const { nextSequence, prevHash } = await resolvePreviousState(client);
  const canonicalPayload = canonicalize({
    actorId,
    actorRole: payload.actorRole ?? null,
    action: payload.action,
    module,
    resource: payload.resource,
    resourceId: payload.resourceId,
    reason: payload.reason ?? null,
    requestIp: payload.requestIp ?? null,
    requestDevice,
    before: payload.before ?? null,
    after: payload.after ?? null
  }) as Prisma.InputJsonValue;
  const entryHash = hashEntry(prevHash, canonicalPayload);

  const created = await client.auditEntry.create({
    data: {
      sequence: nextSequence,
      actorId,
      actorRole: payload.actorRole ?? null,
      action: payload.action,
      module,
      resource: payload.resource,
      resourceId: payload.resourceId,
      reason: payload.reason ?? null,
      requestIp: payload.requestIp ?? null,
      requestDevice,
      before,
      after,
      canonicalPayload,
      prevHash,
      entryHash,
      hashVersion: 1
    }
  }) as { id?: string } | unknown;

  const entryId = created && typeof created === 'object' && 'id' in created ? String((created as { id: string }).id) : null;
  if (client.auditChainState) {
    await client.auditChainState.upsert({
      where: { id: 1 },
      update: { lastSequence: nextSequence, lastHash: entryHash, lastEntryId: entryId },
      create: { id: 1, lastSequence: nextSequence, lastHash: entryHash, lastEntryId: entryId }
    });
  }

  return created;
}
