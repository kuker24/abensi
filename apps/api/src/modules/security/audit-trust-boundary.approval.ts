import { Prisma } from '@prisma/client';
import {
  ACTIVE_TRUSTED_STATUS,
  HISTORICAL_CHAIN_INTEGRITY_LOSS,
  HISTORICAL_UNTRUSTED_STATUS,
  TRUSTED_STATUS,
  buildTrustBoundaryCanonicalPayload,
  createTrustBoundaryCommitment,
  createTrustBoundaryDescriptor,
  hashAuditEntry,
  verifyAuditTrustBoundary
} from './audit-trust-boundary.core';

export interface AuditTrustBoundaryApprovalInput {
  incidentCode: string;
  expectedLatestSequence: bigint;
  expectedLastTrustedSequence: bigint;
  approvalReference: string;
  dryRun: boolean;
  confirm: boolean;
}

export interface AuditTrustBoundaryApprovalResult {
  ok: boolean;
  dryRun: boolean;
  status: 'DRY_RUN' | 'APPROVED' | 'REJECTED';
  incidentCode: string;
  previousTrustedEndSequence: string;
  historicalUntrustedRange: { from: string; to: string };
  activeEpoch: number;
  boundarySequence: string;
  anomalySummary?: {
    earliestOwnHashMismatch: string | null;
    earliestPreviousLinkMismatch: string | null;
    unexpectedGenesisCount: number;
    firstAnomalySequence: string | null;
    issueCodes: string[];
  };
  reason?: string;
}

type ApprovalAuditEntry = {
  id: string;
  sequence: bigint;
  action: string;
  canonicalPayload: Prisma.JsonValue | null;
  prevHash: string | null;
  entryHash: string | null;
  hashVersion?: number | null;
};

type ApprovalState = {
  id: number;
  lastSequence: bigint;
  lastHash: string | null;
  lastEntryId: string | null;
  activeEpochId: string | null;
};

type ApprovalTransaction = {
  $executeRawUnsafe: (query: string) => Promise<unknown>;
  auditEntry: {
    findMany: (args: { orderBy?: { sequence: 'asc' | 'desc' }; where?: { sequence?: { lte?: bigint; equals?: bigint } } }) => Promise<ApprovalAuditEntry[]>;
    create: (args: { data: Prisma.AuditEntryUncheckedCreateInput }) => Promise<{ id: string }>;
  };
  auditChainState: {
    findUnique: (args: { where: { id: number } }) => Promise<ApprovalState | null>;
    update: (args: { where: { id: number }; data: { lastSequence: bigint; lastHash: string; lastEntryId: string; activeEpochId: string } }) => Promise<unknown>;
  };
  auditChainEpoch: {
    findMany: (args: { orderBy: { epochNumber: 'asc' } }) => Promise<Array<{ id: string; epochNumber: number; startSequence: bigint; endSequence: bigint | null; status: string; previousEpochId: string | null }>>;
    create: (args: { data: { epochNumber: number; startSequence: bigint; endSequence?: bigint; status: 'TRUSTED' | 'ACTIVE_TRUSTED'; previousEpochId?: string } }) => Promise<{ id: string; epochNumber: number }>;
    update: (args: { where: { id: string }; data: { status: 'TRUSTED'; endSequence: bigint; closedAt: Date } }) => Promise<unknown>;
  };
  auditIntegrityIncident: {
    findMany: () => Promise<Array<{ id: string }>>;
    create: (args: { data: { incidentCode: string; reasonCode: 'HISTORICAL_CHAIN_INTEGRITY_LOSS'; status: 'HISTORICAL_UNTRUSTED'; previousTrustedEndSequence: bigint; historicalStartSequence: bigint; historicalEndSequence: bigint; boundaryCommitment: string; approvalReference: string; approvedAt: Date; activeEpochId: string } }) => Promise<{ id: string }>;
  };
};

type ApprovalPrisma = {
  $transaction: <T>(callback: (tx: ApprovalTransaction) => Promise<T>, options: { isolationLevel: Prisma.TransactionIsolationLevel }) => Promise<T>;
};

const INCIDENT_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,79}$/;
const APPROVAL_REFERENCE_PATTERN = /^(?:CHG|INC|TICKET)-[A-Z0-9]+(?:-[A-Z0-9]+){0,4}$/;

function rejected(input: AuditTrustBoundaryApprovalInput, reason: string): AuditTrustBoundaryApprovalResult {
  return {
    ok: false,
    dryRun: input.dryRun,
    status: 'REJECTED',
    incidentCode: input.incidentCode,
    previousTrustedEndSequence: input.expectedLastTrustedSequence.toString(),
    historicalUntrustedRange: {
      from: (input.expectedLastTrustedSequence + 1n).toString(),
      to: input.expectedLatestSequence.toString()
    },
    activeEpoch: 2,
    boundarySequence: (input.expectedLatestSequence + 1n).toString(),
    reason
  };
}

export function validateAuditTrustBoundaryApprovalInput(input: AuditTrustBoundaryApprovalInput) {
  if (!INCIDENT_CODE_PATTERN.test(input.incidentCode)) return 'INCIDENT_CODE_INVALID';
  if (!APPROVAL_REFERENCE_PATTERN.test(input.approvalReference)) return 'APPROVAL_REFERENCE_INVALID';
  if (input.expectedLastTrustedSequence < 1n) return 'LAST_TRUSTED_SEQUENCE_INVALID';
  if (input.expectedLatestSequence <= input.expectedLastTrustedSequence) return 'HISTORICAL_RANGE_INVALID';
  if (!input.dryRun && !input.confirm) return 'CONFIRMATION_REQUIRED';
  return null;
}

function hasExactSequenceContinuity(entries: ApprovalAuditEntry[], expectedLatestSequence: bigint) {
  if (entries.length !== Number(expectedLatestSequence)) return false;
  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index].sequence !== BigInt(index + 1)) return false;
  }
  return true;
}

function collectHistoricalAnomalies(entries: ApprovalAuditEntry[]) {
  let earliestOwnHashMismatch: bigint | null = null;
  let earliestPreviousLinkMismatch: bigint | null = null;
  let unexpectedGenesisCount = 0;
  let previousHash: string | null = null;

  for (const entry of entries) {
    const expectedHash = entry.canonicalPayload === null ? null : hashAuditEntry(entry.prevHash, entry.canonicalPayload);
    if (expectedHash !== null && entry.entryHash !== expectedHash && earliestOwnHashMismatch === null) {
      earliestOwnHashMismatch = entry.sequence;
    }
    if (entry.sequence > 1n && entry.prevHash === null) {
      unexpectedGenesisCount += 1;
      if (earliestPreviousLinkMismatch === null) earliestPreviousLinkMismatch = entry.sequence;
    } else if (entry.sequence > 1n && entry.prevHash !== previousHash && earliestPreviousLinkMismatch === null) {
      earliestPreviousLinkMismatch = entry.sequence;
    }
    previousHash = entry.entryHash;
  }

  const firstAnomaly = [earliestOwnHashMismatch, earliestPreviousLinkMismatch]
    .filter((value): value is bigint => value !== null)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))[0] ?? null;
  const issueCodes = [
    ...(earliestOwnHashMismatch === null ? [] : ['ENTRY_HASH_MISMATCH']),
    ...(earliestPreviousLinkMismatch === null ? [] : ['PREVIOUS_HASH_MISMATCH']),
    ...(unexpectedGenesisCount === 0 ? [] : ['UNEXPECTED_GENESIS'])
  ];

  return {
    earliestOwnHashMismatch,
    earliestPreviousLinkMismatch,
    unexpectedGenesisCount,
    firstAnomaly,
    issueCodes,
    sanitized: {
      earliestOwnHashMismatch: earliestOwnHashMismatch?.toString() ?? null,
      earliestPreviousLinkMismatch: earliestPreviousLinkMismatch?.toString() ?? null,
      unexpectedGenesisCount,
      firstAnomalySequence: firstAnomaly?.toString() ?? null,
      issueCodes
    }
  };
}

async function verifyApprovalPreconditions(tx: ApprovalTransaction, input: AuditTrustBoundaryApprovalInput) {
  const state = await tx.auditChainState.findUnique({ where: { id: 1 } });
  if (!state) return { reason: 'CHAIN_STATE_MISSING' } as const;
  if (state.activeEpochId) return { reason: 'ACTIVE_EPOCH_ALREADY_PRESENT' } as const;
  if (state.lastSequence !== input.expectedLatestSequence || !state.lastHash || !state.lastEntryId) {
    return { reason: 'LATEST_SEQUENCE_PRECONDITION_CHANGED' } as const;
  }

  const [epochs, incidents, allEntries] = await Promise.all([
    tx.auditChainEpoch.findMany({ orderBy: { epochNumber: 'asc' } }),
    tx.auditIntegrityIncident.findMany(),
    tx.auditEntry.findMany({ orderBy: { sequence: 'asc' } })
  ]);
  if (epochs.length > 0 || incidents.length > 0) return { reason: 'BOUNDARY_ALREADY_EXISTS' } as const;
  if (!hasExactSequenceContinuity(allEntries, input.expectedLatestSequence)) {
    return { reason: 'GLOBAL_SEQUENCE_CONTINUITY_PRECONDITION_CHANGED' } as const;
  }

  const tip = allEntries[allEntries.length - 1];
  if (!tip || tip.id !== state.lastEntryId || tip.entryHash !== state.lastHash) {
    return { reason: 'PERSISTED_TIP_PRECONDITION_CHANGED' } as const;
  }

  const trustedEntries = allEntries.filter((entry) => entry.sequence <= input.expectedLastTrustedSequence);
  if (!hasExactSequenceContinuity(trustedEntries, input.expectedLastTrustedSequence)) {
    return { reason: 'TRUSTED_SEQUENCE_PRECONDITION_CHANGED' } as const;
  }
  const trustedTail = trustedEntries[trustedEntries.length - 1];
  const trustedVerification = verifyAuditTrustBoundary({
    entries: trustedEntries,
    state: {
      id: 1,
      lastSequence: input.expectedLastTrustedSequence,
      lastHash: trustedTail?.entryHash ?? null,
      lastEntryId: trustedTail?.id ?? null,
      activeEpochId: null
    },
    epochs: [],
    incidents: []
  });
  const trustedMaterialComplete = trustedEntries.every((entry) => (
    entry.hashVersion === 1 &&
    typeof entry.entryHash === 'string' &&
    entry.entryHash.length > 0 &&
    entry.canonicalPayload !== null &&
    entry.canonicalPayload !== undefined
  ));
  if (
    !trustedMaterialComplete ||
    trustedVerification.checked !== Number(input.expectedLastTrustedSequence) ||
    trustedVerification.legacySkipped !== 0
  ) {
    return { reason: 'TRUSTED_SEGMENT_MATERIAL_OR_VERSION_INVALID' } as const;
  }
  if (!trustedVerification.ok || trustedVerification.status !== 'PASS') {
    return { reason: 'TRUSTED_SEGMENT_NOT_CRYPTOGRAPHICALLY_VALID' } as const;
  }

  const historicalEntries = allEntries.filter((entry) => entry.sequence > input.expectedLastTrustedSequence);
  const expectedHistoricalCount = Number(input.expectedLatestSequence - input.expectedLastTrustedSequence);
  if (historicalEntries.length !== expectedHistoricalCount) {
    return { reason: 'HISTORICAL_RANGE_PRECONDITION_CHANGED' } as const;
  }
  for (let index = 0; index < historicalEntries.length; index += 1) {
    if (historicalEntries[index].sequence !== input.expectedLastTrustedSequence + BigInt(index + 1)) {
      return { reason: 'HISTORICAL_RANGE_PRECONDITION_CHANGED' } as const;
    }
  }

  const anomalies = collectHistoricalAnomalies(allEntries);
  const historicalStartSequence = input.expectedLastTrustedSequence + 1n;
  if (anomalies.firstAnomaly === null || anomalies.firstAnomaly !== historicalStartSequence) {
    return { reason: 'HISTORICAL_ANOMALY_PRECONDITION_NOT_MET', anomalies: anomalies.sanitized } as const;
  }

  return { state, allEntries, anomalies: anomalies.sanitized } as const;
}

export async function approveAuditTrustBoundary(prisma: ApprovalPrisma, input: AuditTrustBoundaryApprovalInput): Promise<AuditTrustBoundaryApprovalResult> {
  const validationError = validateAuditTrustBoundaryApprovalInput(input);
  if (validationError) return rejected(input, validationError);

  const historicalStartSequence = input.expectedLastTrustedSequence + 1n;
  const historicalEndSequence = input.expectedLatestSequence;
  const descriptor = createTrustBoundaryDescriptor({
    incidentCode: input.incidentCode,
    reasonCode: HISTORICAL_CHAIN_INTEGRITY_LOSS,
    previousTrustedEndSequence: input.expectedLastTrustedSequence,
    historicalUntrustedEndSequence: historicalEndSequence,
    newEpochNumber: 2
  });

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(389551911)');
    const preconditions = await verifyApprovalPreconditions(tx, input);
    if ('reason' in preconditions) {
      return {
        ...rejected(input, preconditions.reason ?? 'APPROVAL_PRECONDITION_REJECTED'),
        ...('anomalies' in preconditions ? { anomalySummary: preconditions.anomalies } : {})
      };
    }

    const boundarySequence = historicalEndSequence + 1n;
    const summary: AuditTrustBoundaryApprovalResult = {
      ok: true,
      dryRun: input.dryRun,
      status: input.dryRun ? 'DRY_RUN' : 'APPROVED',
      incidentCode: input.incidentCode,
      previousTrustedEndSequence: input.expectedLastTrustedSequence.toString(),
      historicalUntrustedRange: { from: historicalStartSequence.toString(), to: historicalEndSequence.toString() },
      activeEpoch: 2,
      boundarySequence: boundarySequence.toString(),
      anomalySummary: preconditions.anomalies
    };
    if (input.dryRun) return summary;

    // Create and close epoch one inside same serializable transaction. Database
    // trigger permits only this one-way ACTIVE_TRUSTED -> TRUSTED transition.
    const epochOne = await tx.auditChainEpoch.create({
      data: {
        epochNumber: 1,
        startSequence: 1n,
        status: ACTIVE_TRUSTED_STATUS
      }
    });
    await tx.auditChainEpoch.update({
      where: { id: epochOne.id },
      data: {
        status: TRUSTED_STATUS,
        endSequence: input.expectedLastTrustedSequence,
        closedAt: new Date()
      }
    });
    const epochTwo = await tx.auditChainEpoch.create({
      data: {
        epochNumber: 2,
        startSequence: boundarySequence,
        status: ACTIVE_TRUSTED_STATUS,
        previousEpochId: epochOne.id
      }
    });

    const historicalTip = preconditions.allEntries[preconditions.allEntries.length - 1];
    const boundaryCommitment = createTrustBoundaryCommitment(historicalTip?.entryHash ?? null, descriptor);
    const incident = await tx.auditIntegrityIncident.create({
      data: {
        incidentCode: input.incidentCode,
        reasonCode: HISTORICAL_CHAIN_INTEGRITY_LOSS,
        status: HISTORICAL_UNTRUSTED_STATUS,
        previousTrustedEndSequence: input.expectedLastTrustedSequence,
        historicalStartSequence,
        historicalEndSequence,
        boundaryCommitment,
        approvalReference: input.approvalReference,
        approvedAt: new Date(),
        activeEpochId: epochTwo.id
      }
    });

    const canonicalPayload = buildTrustBoundaryCanonicalPayload({ incidentId: incident.id, descriptor }) as Prisma.InputJsonValue;
    const entryHash = hashAuditEntry(boundaryCommitment, canonicalPayload);
    const boundaryEntry = await tx.auditEntry.create({
      data: {
        sequence: boundarySequence,
        actorId: null,
        actorRole: null,
        action: 'audit.trust_boundary.approved',
        module: 'security',
        resource: 'auditTrustBoundary',
        resourceId: incident.id,
        reason: input.incidentCode,
        requestIp: null,
        requestDevice: 'system:audit-trust-boundary',
        before: Prisma.JsonNull,
        after: descriptor as unknown as Prisma.InputJsonValue,
        canonicalPayload,
        prevHash: boundaryCommitment,
        entryHash,
        hashVersion: 1
      }
    });

    await tx.auditChainState.update({
      where: { id: 1 },
      data: {
        lastSequence: boundarySequence,
        lastHash: entryHash,
        lastEntryId: boundaryEntry.id,
        activeEpochId: epochTwo.id
      }
    });

    return summary;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const auditTrustBoundaryMarker = 'AUDIT_TRUST_BOUNDARY';
