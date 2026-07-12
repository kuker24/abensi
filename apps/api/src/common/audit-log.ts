import { Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';
import { canonicalize } from '../modules/security/canonical-json';
import {
  ACTIVE_TRUSTED_STATUS,
  hashAuditEntry,
  validateActiveAuditEpochBoundary,
  verifyActiveAuditEpochCryptographicLineage,
  verifyAuditTrustBoundary,
  type AuditIntegrityIncidentForVerification
} from '../modules/security/audit-trust-boundary.core';

type AuditClient = {
  $queryRawUnsafe?: (query: string) => Promise<unknown>;
  $executeRawUnsafe?: (query: string) => Promise<unknown>;
  $transaction?: unknown;
  auditEntry: {
    create: (args: { data: Prisma.AuditEntryUncheckedCreateInput }) => Promise<unknown>;
    findMany?: (args: { where?: Prisma.AuditEntryWhereInput; orderBy?: Prisma.AuditEntryOrderByWithRelationInput | Prisma.AuditEntryOrderByWithRelationInput[]; take?: number }) => Promise<Array<{
      id: string;
      sequence?: bigint | number | null;
      action?: string | null;
      resource?: string | null;
      resourceId?: string | null;
      canonicalPayload?: unknown | null;
      prevHash?: string | null;
      entryHash: string | null;
      hashVersion?: number | null;
      before?: unknown | null;
      after?: unknown | null;
      createdAt: Date;
    }>>;
  };
  auditChainState?: {
    findUnique: (args: { where: { id: number }; include?: { activeEpoch?: boolean } }) => Promise<AuditChainState | null>;
    upsert: (args: {
      where: { id: number };
      update: { lastSequence: bigint; lastHash: string | null; lastEntryId: string | null; activeEpochId?: string | null };
      create: { id: number; lastSequence: bigint; lastHash: string | null; lastEntryId: string | null; activeEpochId?: string | null };
    }) => Promise<unknown>;
  };
  auditChainEpoch?: {
    findMany: (args: { orderBy: { epochNumber: 'asc' } }) => Promise<AuditChainEpoch[]>;
    create: (args: { data: { epochNumber: number; startSequence: bigint; status: 'ACTIVE_TRUSTED' } }) => Promise<AuditChainEpoch>;
  };
  auditIntegrityIncident?: {
    findMany: () => Promise<AuditIntegrityIncidentForVerification[]>;
  };
};

type AuditChainState = {
  id: number;
  lastSequence?: bigint | number | null;
  lastHash: string | null;
  lastEntryId: string | null;
  activeEpochId?: string | null;
  activeEpoch?: AuditChainEpoch | null;
};

type AuditChainEpoch = {
  id: string;
  epochNumber: number;
  startSequence: bigint | number;
  endSequence: bigint | number | null;
  status: string;
  previousEpochId?: string | null;
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

function epochStartSequence(epoch: AuditChainEpoch) {
  return BigInt(epoch.startSequence);
}

function stateLastSequence(state: AuditChainState | null) {
  return BigInt(state?.lastSequence ?? 0);
}

function assertActiveEpochCanAcceptNextEntry(state: AuditChainState | null, activeEpoch: AuditChainEpoch) {
  const lastSequence = stateLastSequence(state);
  const startSequence = epochStartSequence(activeEpoch);

  if (activeEpoch.endSequence !== null && activeEpoch.endSequence !== undefined) {
    throw new Error('Audit chain active epoch is closed. Audit writes are fail-closed until approved workflow creates a valid active epoch.');
  }
  if (lastSequence > 0n && (!state?.lastHash || !state.lastEntryId)) {
    throw new Error('Audit chain state tip is incomplete. Audit writes are fail-closed until metadata is repaired through approved workflow.');
  }
  if (lastSequence < startSequence - 1n) {
    throw new Error('Audit chain state precedes active epoch start. Audit writes are fail-closed until metadata is repaired through approved workflow.');
  }
  if (lastSequence === startSequence - 1n) {
    const isFreshEpochOne = activeEpoch.epochNumber === 1 && startSequence === 1n && lastSequence === 0n && !state?.lastHash && !state?.lastEntryId;
    if (!isFreshEpochOne) {
      throw new Error('Audit chain active epoch has no approved boundary marker. Audit writes are fail-closed until boundary approval completes.');
    }
  }
}

async function assertPersistedActiveEpochLineage(client: AuditClient, state: AuditChainState | null, activeEpoch: AuditChainEpoch, epochs: AuditChainEpoch[]) {
  if (!client.auditEntry.findMany) {
    throw new Error('Audit active epoch cannot be verified. Audit writes are fail-closed until approved workflow is available.');
  }

  const startSequence = epochStartSequence(activeEpoch);
  const stateSequence = stateLastSequence(state);
  const activeEpochEntries = stateSequence >= startSequence
    ? await client.auditEntry.findMany({
      where: { sequence: { gte: startSequence, lte: stateSequence } },
      orderBy: { sequence: 'asc' }
    })
    : [];
  const stateTip = activeEpochEntries.find((entry) => entry.sequence !== null && entry.sequence !== undefined && BigInt(entry.sequence) === stateSequence) ?? null;
  const isFreshEpochOne = activeEpoch.epochNumber === 1 && startSequence === 1n && stateSequence === 0n && !state?.lastHash && !state?.lastEntryId;

  let incident: AuditIntegrityIncidentForVerification | null = null;
  let historicalTip: Awaited<ReturnType<NonNullable<AuditClient['auditEntry']['findMany']>>>[number] | null = null;
  let boundaryEntry: Awaited<ReturnType<NonNullable<AuditClient['auditEntry']['findMany']>>>[number] | null = null;
  const previousEpoch = epochs.find((epoch) => epoch.id === activeEpoch.previousEpochId) ?? null;

  if (activeEpoch.epochNumber > 1) {
    if (!client.auditIntegrityIncident) {
      throw new Error('Audit incident linkage cannot be verified. Audit writes are fail-closed until approved workflow is available.');
    }
    const incidents = await client.auditIntegrityIncident.findMany();
    incident = incidents.find((candidate) => candidate.activeEpochId === activeEpoch.id) ?? null;
    const historicalEnd = incident ? BigInt(incident.historicalEndSequence) : null;
    if (historicalEnd === null) {
      throw new Error('Audit chain boundary metadata is invalid (HISTORICAL_INCIDENT_INVALID). Audit writes are fail-closed until approved remediation.');
    }
    const [historicalEntries, boundaryEntries] = await Promise.all([
      client.auditEntry.findMany({ where: { sequence: { gte: historicalEnd, lte: historicalEnd } }, orderBy: { sequence: 'asc' }, take: 1 }),
      client.auditEntry.findMany({ where: { sequence: { gte: startSequence, lte: startSequence } }, orderBy: { sequence: 'asc' }, take: 1 })
    ]);
    historicalTip = historicalEntries.find((entry) => entry.sequence !== null && entry.sequence !== undefined && BigInt(entry.sequence) === historicalEnd) ?? null;
    boundaryEntry = boundaryEntries.find((entry) => entry.sequence !== null && entry.sequence !== undefined && BigInt(entry.sequence) === startSequence) ?? null;
  }

  const boundaryValidation = validateActiveAuditEpochBoundary({
    state,
    activeEpoch,
    previousEpoch,
    incident,
    historicalTip,
    boundaryEntry,
    stateTip
  });
  if (!boundaryValidation.ok) {
    throw new Error(`Audit chain boundary metadata is invalid (${boundaryValidation.issueCodes.join(',')}). Audit writes are fail-closed until approved remediation.`);
  }

  const lineage = verifyActiveAuditEpochCryptographicLineage({
    entries: activeEpochEntries,
    state,
    activeEpoch
  });
  if (!lineage.ok) {
    throw new Error(`Audit chain active epoch cryptographic lineage is invalid (${lineage.issueCodes.join(',')}). Audit writes are fail-closed until approved remediation.`);
  }
  if (isFreshEpochOne && lineage.checked !== 0) {
    throw new Error('Audit chain fresh epoch verification is inconsistent. Audit writes are fail-closed until approved remediation.');
  }
}

async function resolveActiveEpoch(client: AuditClient, state: AuditChainState | null) {
  if (!client.auditChainEpoch || !client.auditChainState) return null;

  const epochs = await client.auditChainEpoch.findMany({ orderBy: { epochNumber: 'asc' } });
  if (epochs.length === 0) {
    const lastSequence = stateLastSequence(state);
    if (lastSequence > 0n) {
      const entries = client.auditEntry.findMany
        ? await client.auditEntry.findMany({ orderBy: { sequence: 'asc' }, take: 100000 })
        : [];
      const strictVerification = verifyAuditTrustBoundary({
        entries,
        state: state ?? null,
        epochs: [],
        incidents: []
      });
      if (!strictVerification.ok || strictVerification.status !== 'PASS' || entries.length !== Number(lastSequence)) {
        throw new Error('Audit chain epoch metadata is missing and strict legacy verification failed. Audit writes are fail-closed until approved remediation.');
      }
    } else if (state?.lastHash || state?.lastEntryId) {
      throw new Error('Empty audit chain state is inconsistent. Audit writes are fail-closed until approved remediation.');
    }

    const initial = await client.auditChainEpoch.create({
      data: { epochNumber: 1, startSequence: 1n, status: ACTIVE_TRUSTED_STATUS }
    });
    await client.auditChainState.upsert({
      where: { id: 1 },
      update: {
        lastSequence,
        lastHash: state?.lastHash ?? null,
        lastEntryId: state?.lastEntryId ?? null,
        activeEpochId: initial.id
      },
      create: {
        id: 1,
        lastSequence,
        lastHash: state?.lastHash ?? null,
        lastEntryId: state?.lastEntryId ?? null,
        activeEpochId: initial.id
      }
    });
    return initial;
  }

  const active = epochs.filter((epoch) => epoch.status === ACTIVE_TRUSTED_STATUS);
  if (active.length !== 1 || !state?.activeEpochId || active[0].id !== state.activeEpochId) {
    throw new Error('Audit chain active epoch is invalid. Audit writes are fail-closed until metadata is repaired through approved workflow.');
  }
  assertActiveEpochCanAcceptNextEntry(state, active[0]);
  await assertPersistedActiveEpochLineage(client, state, active[0], epochs);
  return active[0];
}

async function resolvePreviousState(client: AuditClient) {
  if (client.auditChainState) {
    const state = await client.auditChainState.findUnique({ where: { id: 1 }, include: { activeEpoch: true } });
    const activeEpoch = await resolveActiveEpoch(client, state);
    const lastSequence = stateLastSequence(state);
    return {
      activeEpoch,
      lastSequence,
      nextSequence: lastSequence + 1n,
      prevHash: state?.lastHash ?? null,
      lastEntryId: state?.lastEntryId ?? null
    };
  }

  const latest = client.auditEntry.findMany
    ? await client.auditEntry.findMany({ orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }], take: 1 })
    : [];
  const lastSequence = BigInt(latest[0]?.sequence ?? 0);
  return { activeEpoch: null, lastSequence, nextSequence: lastSequence + 1n, prevHash: latest[0]?.entryHash ?? null, lastEntryId: latest[0]?.id ?? null };
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
  const entryHash = hashAuditEntry(prevHash, canonicalPayload);

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
    const state = await client.auditChainState.findUnique({ where: { id: 1 } });
    if (!state?.activeEpochId && client.auditChainEpoch) {
      throw new Error('Audit chain state lost its active epoch during write. Transaction must roll back.');
    }
    await client.auditChainState.upsert({
      where: { id: 1 },
      update: { lastSequence: nextSequence, lastHash: entryHash, lastEntryId: entryId },
      create: { id: 1, lastSequence: nextSequence, lastHash: entryHash, lastEntryId: entryId }
    });
  }

  return created;
}
