import { Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import { canonicalJson, canonicalize } from '../modules/security/canonical-json';

type AuditClient = {
  auditEntry: {
    create: (args: { data: Prisma.AuditEntryUncheckedCreateInput }) => Promise<unknown>;
    findMany?: (args: { where?: Prisma.AuditEntryWhereInput; orderBy?: Prisma.AuditEntryOrderByWithRelationInput; take?: number }) => Promise<Array<{ id: string; entryHash: string | null; createdAt: Date }>>;
  };
  auditChainState?: {
    findUnique: (args: { where: { id: number } }) => Promise<{ id: number; lastHash: string | null; lastEntryId: string | null } | null>;
    upsert: (args: {
      where: { id: number };
      update: { lastHash: string | null; lastEntryId: string | null };
      create: { id: number; lastHash: string | null; lastEntryId: string | null };
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

async function resolvePreviousHash(client: AuditClient) {
  if (client.auditChainState) {
    const state = await client.auditChainState.findUnique({ where: { id: 1 } });
    return { prevHash: state?.lastHash ?? null, lastEntryId: state?.lastEntryId ?? null };
  }

  const latest = client.auditEntry.findMany
    ? await client.auditEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 1 })
    : [];
  return { prevHash: latest[0]?.entryHash ?? null, lastEntryId: latest[0]?.id ?? null };
}

function normalizeActorForAudit(payload: AuditLogInput) {
  const actorId = payload.actorId ?? null;
  const isSyntheticActor = Boolean(actorId && /^(reader|worker|system):/.test(actorId));
  return {
    actorId: isSyntheticActor ? null : actorId,
    requestDevice: payload.requestDevice ?? (isSyntheticActor ? actorId : null)
  };
}

export async function writeAudit(client: AuditClient, payload: AuditLogInput) {
  const module = inferModule(payload.action, payload.module);
  const before = normalizeJson(payload.before);
  const after = normalizeJson(payload.after);
  const { actorId, requestDevice } = normalizeActorForAudit(payload);
  const { prevHash } = await resolvePreviousHash(client);
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
      update: { lastHash: entryHash, lastEntryId: entryId },
      create: { id: 1, lastHash: entryHash, lastEntryId: entryId }
    });
  }

  return created;
}
