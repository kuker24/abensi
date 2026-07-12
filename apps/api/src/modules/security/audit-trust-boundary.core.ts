import { createHash } from 'node:crypto';
import { canonicalJson, canonicalize } from './canonical-json';

export const AUDIT_TRUST_BOUNDARY_MARKER = 'AUDIT_TRUST_BOUNDARY';
export const HISTORICAL_UNTRUSTED_STATUS = 'HISTORICAL_UNTRUSTED';
export const ACTIVE_TRUSTED_STATUS = 'ACTIVE_TRUSTED';
export const TRUSTED_STATUS = 'TRUSTED';
export const HISTORICAL_CHAIN_INTEGRITY_LOSS = 'HISTORICAL_CHAIN_INTEGRITY_LOSS';

export type AuditVerificationStatus = 'PASS' | 'PASS_WITH_APPROVED_HISTORICAL_BOUNDARY' | 'FAIL';
export type AuditTrustClassification =
  | 'DECLARED_TRUSTED_EPOCH'
  | 'DECLARED_HISTORICAL_UNTRUSTED'
  | 'BOUNDARY_MARKER'
  | 'LEGACY_METADATA_PENDING'
  | 'INVALID_UNEXPECTED';

export interface AuditEntryForVerification {
  id?: string | null;
  sequence?: bigint | number | string | null;
  action?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  canonicalPayload?: unknown | null;
  prevHash?: string | null;
  entryHash?: string | null;
  hashVersion?: number | null;
  before?: unknown | null;
  after?: unknown | null;
}

export interface AuditChainStateForVerification {
  id?: number;
  lastSequence?: bigint | number | string | null;
  lastHash: string | null;
  lastEntryId: string | null;
  activeEpochId?: string | null;
}

export interface AuditChainEpochForVerification {
  id: string;
  epochNumber: number;
  startSequence: bigint | number | string;
  endSequence: bigint | number | string | null;
  status: string;
  previousEpochId?: string | null;
}

export interface AuditIntegrityIncidentForVerification {
  id: string;
  incidentCode: string;
  reasonCode: string;
  status: string;
  previousTrustedEndSequence: bigint | number | string;
  historicalStartSequence: bigint | number | string;
  historicalEndSequence: bigint | number | string;
  boundaryCommitment: string;
  activeEpochId: string;
  approvedAt?: Date | string | null;
}

export interface TrustBoundaryDescriptor {
  marker: typeof AUDIT_TRUST_BOUNDARY_MARKER;
  incidentCode: string;
  reasonCode: typeof HISTORICAL_CHAIN_INTEGRITY_LOSS;
  previousTrustedEndSequence: string;
  historicalUntrustedEndSequence: string;
  newEpochNumber: number;
}

export interface AuditVerificationIssue {
  code: string;
  sequence?: string;
}

export interface AuditTrustBoundaryVerification {
  ok: boolean;
  status: AuditVerificationStatus;
  checked: number;
  totalScanned: number;
  legacySkipped: number;
  trustedThroughSequence: string | null;
  historicalUntrustedRange: { from: string; to: string } | null;
  activeEpoch: number | null;
  historicalFindings: number;
  issues: AuditVerificationIssue[];
}

export interface SanitizedAuditTrustBoundarySummary {
  ok: boolean;
  status: AuditVerificationStatus;
  trustedThroughSequence: string | null;
  historicalUntrustedRange: { from: string; to: string } | null;
  activeEpoch: number | null;
  historicalFindings: number;
  issueCodes: string[];
}

function sequenceOf(value: bigint | number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function sequenceText(value: bigint | number | string | null | undefined) {
  const sequence = sequenceOf(value);
  return sequence === null ? null : sequence.toString();
}

function issue(issues: AuditVerificationIssue[], code: string, sequence?: bigint | null) {
  if (issues.length >= 50) return;
  issues.push(sequence === undefined || sequence === null ? { code } : { code, sequence: sequence.toString() });
}

function inRange(sequence: bigint, from: bigint, to: bigint) {
  return sequence >= from && sequence <= to;
}

function hasAuditMaterial(entry: AuditEntryForVerification) {
  return Boolean(entry.entryHash && entry.canonicalPayload);
}

function exactCanonicalJson(left: unknown, right: unknown) {
  return canonicalJson(canonicalize(left)) === canonicalJson(canonicalize(right));
}

export function isAuditTrustBoundaryReasonCode(value: unknown): value is typeof HISTORICAL_CHAIN_INTEGRITY_LOSS {
  return value === HISTORICAL_CHAIN_INTEGRITY_LOSS;
}

export function hashAuditEntry(prevHash: string | null | undefined, canonicalPayload: unknown) {
  return createHash('sha256')
    .update(prevHash || 'GENESIS')
    .update(canonicalJson(canonicalPayload))
    .digest('hex');
}

export function createTrustBoundaryDescriptor(input: {
  incidentCode: string;
  reasonCode: typeof HISTORICAL_CHAIN_INTEGRITY_LOSS;
  previousTrustedEndSequence: bigint | number | string;
  historicalUntrustedEndSequence: bigint | number | string;
  newEpochNumber: number;
}): TrustBoundaryDescriptor {
  const previousTrustedEndSequence = sequenceText(input.previousTrustedEndSequence);
  const historicalUntrustedEndSequence = sequenceText(input.historicalUntrustedEndSequence);
  if (!previousTrustedEndSequence || !historicalUntrustedEndSequence) {
    throw new Error('Audit trust-boundary descriptor requires valid sequence values.');
  }
  if (!isAuditTrustBoundaryReasonCode(input.reasonCode)) {
    throw new Error('Audit trust-boundary descriptor requires an approved reason code.');
  }

  return {
    marker: AUDIT_TRUST_BOUNDARY_MARKER,
    incidentCode: input.incidentCode,
    reasonCode: input.reasonCode,
    previousTrustedEndSequence,
    historicalUntrustedEndSequence,
    newEpochNumber: input.newEpochNumber
  };
}

export function createTrustBoundaryCommitment(previousPersistedTip: string | null, descriptor: TrustBoundaryDescriptor) {
  return createHash('sha256')
    .update(AUDIT_TRUST_BOUNDARY_MARKER)
    .update(previousPersistedTip || 'GENESIS')
    .update(canonicalJson(descriptor))
    .digest('hex');
}

export function buildTrustBoundaryCanonicalPayload(input: {
  incidentId: string;
  descriptor: TrustBoundaryDescriptor;
}) {
  return canonicalize({
    actorId: null,
    actorRole: null,
    action: 'audit.trust_boundary.approved',
    module: 'security',
    resource: 'auditTrustBoundary',
    resourceId: input.incidentId,
    reason: input.descriptor.incidentCode,
    requestIp: null,
    requestDevice: 'system:audit-trust-boundary',
    before: null,
    after: input.descriptor
  });
}

export function isApprovedTrustBoundaryMarker(
  entry: AuditEntryForVerification,
  incident: AuditIntegrityIncidentForVerification,
  activeEpoch: AuditChainEpochForVerification
) {
  try {
    if (!isAuditTrustBoundaryReasonCode(incident.reasonCode)) return false;
    const descriptor = createTrustBoundaryDescriptor({
      incidentCode: incident.incidentCode,
      reasonCode: incident.reasonCode,
      previousTrustedEndSequence: incident.previousTrustedEndSequence,
      historicalUntrustedEndSequence: incident.historicalEndSequence,
      newEpochNumber: activeEpoch.epochNumber
    });
    const expectedPayload = buildTrustBoundaryCanonicalPayload({ incidentId: incident.id, descriptor });
    const afterDescriptor = entry.after === null || entry.after === undefined
      ? (entry.canonicalPayload && typeof entry.canonicalPayload === 'object' && !Array.isArray(entry.canonicalPayload)
        ? (entry.canonicalPayload as Record<string, unknown>).after
        : null)
      : entry.after;
    const expectedEntryHash = hashAuditEntry(incident.boundaryCommitment, expectedPayload);

    return (
      entry.action === 'audit.trust_boundary.approved' &&
      entry.resource === 'auditTrustBoundary' &&
      entry.resourceId === incident.id &&
      entry.prevHash === incident.boundaryCommitment &&
      entry.entryHash === expectedEntryHash &&
      exactCanonicalJson(afterDescriptor, descriptor) &&
      exactCanonicalJson(entry.canonicalPayload, expectedPayload)
    );
  } catch {
    return false;
  }
}

export interface ActiveAuditEpochBoundaryValidationInput {
  state: AuditChainStateForVerification | null;
  activeEpoch: AuditChainEpochForVerification;
  previousEpoch: AuditChainEpochForVerification | null;
  incident: AuditIntegrityIncidentForVerification | null;
  historicalTip: AuditEntryForVerification | null;
  boundaryEntry: AuditEntryForVerification | null;
  stateTip: AuditEntryForVerification | null;
}

export interface ActiveAuditEpochBoundaryValidation {
  ok: boolean;
  issueCodes: string[];
}

export interface ActiveAuditEpochCryptographicLineageVerification {
  ok: boolean;
  checked: number;
  issueCodes: string[];
}

/**
 * Checks database metadata and persisted marker before writer accepts an epoch.
 * It returns only issue codes so callers never emit payloads or hashes.
 */
export function validateActiveAuditEpochBoundary(
  input: ActiveAuditEpochBoundaryValidationInput
): ActiveAuditEpochBoundaryValidation {
  const issues: string[] = [];
  const { state, activeEpoch, previousEpoch, incident, historicalTip, boundaryEntry, stateTip } = input;
  const activeStart = sequenceOf(activeEpoch.startSequence);
  const stateSequence = sequenceOf(state?.lastSequence);

  if (activeEpoch.status !== ACTIVE_TRUSTED_STATUS || activeEpoch.endSequence !== null && activeEpoch.endSequence !== undefined) {
    issues.push('ACTIVE_EPOCH_INVALID');
  }
  if (!state || state.activeEpochId !== activeEpoch.id) issues.push('CHAIN_STATE_ACTIVE_EPOCH_MISMATCH');
  const isFreshEpochOne = Boolean(
    activeEpoch.epochNumber === 1 &&
    activeStart === 1n &&
    stateSequence === 0n &&
    !state?.lastHash &&
    !state?.lastEntryId
  );
  if (!isFreshEpochOne && (activeStart === null || stateSequence === null || stateSequence < activeStart)) {
    issues.push('CHAIN_STATE_EPOCH_START_MISMATCH');
  }
  if (!isFreshEpochOne && (!state?.lastHash || !state.lastEntryId || !stateTip || sequenceOf(stateTip.sequence) !== stateSequence || stateTip.id !== state.lastEntryId || stateTip.entryHash !== state.lastHash)) {
    issues.push('CHAIN_STATE_TIP_MISMATCH');
  }

  if (activeEpoch.epochNumber === 1) {
    if (activeStart !== 1n || activeEpoch.previousEpochId !== null) issues.push('INITIAL_ACTIVE_EPOCH_INVALID');
    return { ok: issues.length === 0, issueCodes: issues };
  }

  if (!incident || incident.activeEpochId !== activeEpoch.id) issues.push('ACTIVE_EPOCH_INCIDENT_LINK_MISMATCH');
  if (!incident || incident.status !== HISTORICAL_UNTRUSTED_STATUS || !incident.approvedAt) issues.push('HISTORICAL_INCIDENT_INVALID');
  if (!previousEpoch || activeEpoch.previousEpochId !== previousEpoch.id || previousEpoch.status !== TRUSTED_STATUS) {
    issues.push('PREVIOUS_EPOCH_LINEAGE_MISMATCH');
  }
  if (!incident || !isAuditTrustBoundaryReasonCode(incident.reasonCode)) issues.push('BOUNDARY_REASON_CODE_INVALID');

  const historicalEnd = incident ? sequenceOf(incident.historicalEndSequence) : null;
  const previousTrustedEnd = incident ? sequenceOf(incident.previousTrustedEndSequence) : null;
  if (
    historicalEnd === null ||
    previousTrustedEnd === null ||
    (incident !== null && sequenceOf(incident.historicalStartSequence) !== previousTrustedEnd + 1n) ||
    !historicalTip ||
    sequenceOf(historicalTip.sequence) !== historicalEnd ||
    !historicalTip.entryHash ||
    !previousEpoch ||
    sequenceOf(previousEpoch.endSequence) !== previousTrustedEnd ||
    activeStart !== historicalEnd + 1n
  ) {
    issues.push('BOUNDARY_RANGE_OR_LINEAGE_MISMATCH');
  }

  if (incident && historicalTip?.entryHash && isAuditTrustBoundaryReasonCode(incident.reasonCode)) {
    try {
      const descriptor = createTrustBoundaryDescriptor({
        incidentCode: incident.incidentCode,
        reasonCode: incident.reasonCode,
        previousTrustedEndSequence: incident.previousTrustedEndSequence,
        historicalUntrustedEndSequence: incident.historicalEndSequence,
        newEpochNumber: activeEpoch.epochNumber
      });
      const expectedCommitment = createTrustBoundaryCommitment(historicalTip.entryHash, descriptor);
      if (incident.boundaryCommitment !== expectedCommitment) issues.push('BOUNDARY_COMMITMENT_MISMATCH');
    } catch {
      issues.push('BOUNDARY_DESCRIPTOR_INVALID');
    }
  }

  if (!boundaryEntry || sequenceOf(boundaryEntry.sequence) !== activeStart || !incident || !isApprovedTrustBoundaryMarker(boundaryEntry, incident, activeEpoch)) {
    issues.push('BOUNDARY_MARKER_INVALID');
  }

  return { ok: issues.length === 0, issueCodes: [...new Set(issues)] };
}

/**
 * Recomputes every persisted entry in the active epoch before a writer appends.
 * The caller must separately validate the approved boundary marker with
 * validateActiveAuditEpochBoundary(). This function verifies the marker is the
 * first active-epoch entry, then verifies each later entry links to it exactly.
 */
export function verifyActiveAuditEpochCryptographicLineage(input: {
  entries: AuditEntryForVerification[];
  state: AuditChainStateForVerification | null;
  activeEpoch: AuditChainEpochForVerification;
}): ActiveAuditEpochCryptographicLineageVerification {
  const issues: string[] = [];
  const startSequence = sequenceOf(input.activeEpoch.startSequence);
  const stateSequence = sequenceOf(input.state?.lastSequence);
  const entries = sortEntries(input.entries);
  const isFreshEpochOne = Boolean(
    input.activeEpoch.epochNumber === 1 &&
    startSequence === 1n &&
    stateSequence === 0n &&
    !input.state?.lastHash &&
    !input.state?.lastEntryId
  );

  if (isFreshEpochOne) return { ok: true, checked: 0, issueCodes: [] };
  if (startSequence === null || stateSequence === null || stateSequence < startSequence) {
    return { ok: false, checked: 0, issueCodes: ['ACTIVE_EPOCH_SEQUENCE_RANGE_INVALID'] };
  }

  const expectedCount = stateSequence - startSequence + 1n;
  if (BigInt(entries.length) !== expectedCount) issues.push('ACTIVE_EPOCH_ENTRY_COUNT_MISMATCH');

  let previousHash: string | null = null;
  let checked = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const sequence = sequenceOf(entry.sequence);
    const expectedSequence = startSequence + BigInt(index);
    if (sequence !== expectedSequence) issues.push('ACTIVE_EPOCH_SEQUENCE_GAP_OR_DUPLICATE');

    const hasMaterial = typeof entry.entryHash === 'string' && entry.entryHash.length > 0 && entry.canonicalPayload !== null && entry.canonicalPayload !== undefined;
    if (!hasMaterial) {
      issues.push('ACTIVE_EPOCH_MISSING_AUDIT_HASH_MATERIAL');
      continue;
    }
    if (entry.hashVersion !== 1) {
      issues.push('ACTIVE_EPOCH_UNSUPPORTED_HASH_VERSION');
      continue;
    }

    const expectedHash = hashAuditEntry(entry.prevHash, canonicalize(entry.canonicalPayload));
    if (entry.entryHash !== expectedHash) issues.push('ACTIVE_EPOCH_ENTRY_HASH_MISMATCH');

    if (index === 0) {
      if (input.activeEpoch.epochNumber === 1 && entry.prevHash !== null) {
        issues.push('ACTIVE_EPOCH_INITIAL_PREVIOUS_HASH_MISMATCH');
      }
    } else if (entry.prevHash !== previousHash) {
      issues.push('ACTIVE_EPOCH_PREVIOUS_HASH_MISMATCH');
    }

    previousHash = entry.entryHash ?? null;
    checked += 1;
  }

  const tip = entries[entries.length - 1] ?? null;
  if (
    !input.state ||
    !tip ||
    sequenceOf(tip.sequence) !== stateSequence ||
    tip.id !== input.state.lastEntryId ||
    tip.entryHash !== input.state.lastHash
  ) {
    issues.push('ACTIVE_EPOCH_STATE_TIP_MISMATCH');
  }

  return { ok: issues.length === 0, checked, issueCodes: [...new Set(issues)] };
}

function sortEntries(entries: AuditEntryForVerification[]) {
  return [...entries].sort((left, right) => {
    const leftSequence = sequenceOf(left.sequence) ?? -1n;
    const rightSequence = sequenceOf(right.sequence) ?? -1n;
    return leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : 0;
  });
}

function validEpochRange(epoch: AuditChainEpochForVerification) {
  const start = sequenceOf(epoch.startSequence);
  const end = sequenceOf(epoch.endSequence);
  return start !== null && start > 0n && (end === null || end >= start);
}

export function toSanitizedAuditTrustBoundarySummary(
  verification: AuditTrustBoundaryVerification
): SanitizedAuditTrustBoundarySummary {
  return {
    ok: verification.ok,
    status: verification.status,
    trustedThroughSequence: verification.trustedThroughSequence,
    historicalUntrustedRange: verification.historicalUntrustedRange,
    activeEpoch: verification.activeEpoch,
    historicalFindings: verification.historicalFindings,
    issueCodes: [...new Set(verification.issues.map((entry) => entry.code))]
  };
}

export function verifyAuditTrustBoundary(input: {
  entries: AuditEntryForVerification[];
  state: AuditChainStateForVerification | null;
  epochs?: AuditChainEpochForVerification[];
  incidents?: AuditIntegrityIncidentForVerification[];
}): AuditTrustBoundaryVerification {
  const entries = sortEntries(input.entries);
  const state = input.state;
  const epochs = input.epochs ?? [];
  const incidents = input.incidents ?? [];
  const issues: AuditVerificationIssue[] = [];
  let historicalFindings = 0;
  let legacySkipped = 0;
  let checked = 0;
  let trustedThroughSequence: string | null = null;
  let historicalUntrustedRange: { from: string; to: string } | null = null;
  let activeEpoch: number | null = null;

  const metadataPresent = epochs.length > 0 || incidents.length > 0 || Boolean(state?.activeEpochId);
  const activeEpochs = epochs.filter((epoch) => epoch.status === ACTIVE_TRUSTED_STATUS);
  for (const epoch of epochs) {
    if (!validEpochRange(epoch)) issue(issues, 'INVALID_EPOCH_RANGE');
  }
  for (let index = 0; index < epochs.length; index += 1) {
    for (let compare = index + 1; compare < epochs.length; compare += 1) {
      const current = epochs[index];
      const other = epochs[compare];
      const currentStart = sequenceOf(current.startSequence);
      const currentEnd = sequenceOf(current.endSequence);
      const otherStart = sequenceOf(other.startSequence);
      const otherEnd = sequenceOf(other.endSequence);
      if (currentStart === null || otherStart === null) continue;
      const overlaps =
        (currentEnd === null || otherStart <= currentEnd) &&
        (otherEnd === null || currentStart <= otherEnd);
      if (overlaps) issue(issues, 'OVERLAPPING_EPOCH_RANGE');
    }
  }

  let incident: AuditIntegrityIncidentForVerification | null = null;
  let trustedEpoch: AuditChainEpochForVerification | null = null;
  let active: AuditChainEpochForVerification | null = null;
  let historicalStart: bigint | null = null;
  let historicalEnd: bigint | null = null;

  if (metadataPresent) {
    if (!state) issue(issues, 'MISSING_CHAIN_STATE');
    if (activeEpochs.length !== 1) issue(issues, 'ACTIVE_EPOCH_COUNT_INVALID');
    active = activeEpochs[0] ?? null;
    if (active && state?.activeEpochId !== active.id) issue(issues, 'CHAIN_STATE_ACTIVE_EPOCH_MISMATCH');
    if (active) activeEpoch = active.epochNumber;

    if (incidents.length > 1) {
      issue(issues, 'MULTIPLE_HISTORICAL_INCIDENTS_UNSUPPORTED');
    } else if (incidents.length === 1) {
      incident = incidents[0];
      historicalStart = sequenceOf(incident.historicalStartSequence);
      historicalEnd = sequenceOf(incident.historicalEndSequence);
      const previousTrustedEnd = sequenceOf(incident.previousTrustedEndSequence);
      trustedEpoch = epochs.find((epoch) => epoch.epochNumber === 1) ?? null;

      if (
        incident.status !== HISTORICAL_UNTRUSTED_STATUS ||
        !incident.approvedAt ||
        !isAuditTrustBoundaryReasonCode(incident.reasonCode) ||
        historicalStart === null ||
        historicalEnd === null ||
        previousTrustedEnd === null ||
        historicalStart !== previousTrustedEnd + 1n ||
        historicalEnd < historicalStart
      ) {
        issue(issues, 'HISTORICAL_INCIDENT_INVALID');
      } else {
        trustedThroughSequence = previousTrustedEnd.toString();
        historicalUntrustedRange = { from: historicalStart.toString(), to: historicalEnd.toString() };
      }

      if (
        !trustedEpoch ||
        trustedEpoch.status !== TRUSTED_STATUS ||
        sequenceOf(trustedEpoch.startSequence) !== 1n ||
        sequenceOf(trustedEpoch.endSequence) !== previousTrustedEnd
      ) {
        issue(issues, 'TRUSTED_EPOCH_INVALID');
      }
      if (
        !active ||
        active.epochNumber !== 2 ||
        active.previousEpochId !== trustedEpoch?.id ||
        sequenceOf(active.startSequence) !== (historicalEnd === null ? null : historicalEnd + 1n) ||
        active.endSequence !== null ||
        incident.activeEpochId !== active.id
      ) {
        issue(issues, 'APPROVED_BOUNDARY_EPOCH_INVALID');
      }
    } else if (active) {
      if (
        active.epochNumber !== 1 ||
        active.previousEpochId !== null ||
        sequenceOf(active.startSequence) !== 1n ||
        active.endSequence !== null
      ) {
        issue(issues, 'INITIAL_ACTIVE_EPOCH_INVALID');
      }
    }
  }

  if (incident && active && historicalEnd !== null) {
    const historicalTip = entries.find((entry) => sequenceOf(entry.sequence) === historicalEnd);
    if (!historicalTip?.entryHash) {
      issue(issues, 'HISTORICAL_BOUNDARY_TIP_MISSING', historicalEnd);
    } else if (isAuditTrustBoundaryReasonCode(incident.reasonCode)) {
      const descriptor = createTrustBoundaryDescriptor({
        incidentCode: incident.incidentCode,
        reasonCode: incident.reasonCode,
        previousTrustedEndSequence: incident.previousTrustedEndSequence,
        historicalUntrustedEndSequence: incident.historicalEndSequence,
        newEpochNumber: active.epochNumber
      });
      const expectedCommitment = createTrustBoundaryCommitment(historicalTip.entryHash, descriptor);
      if (incident.boundaryCommitment !== expectedCommitment) {
        issue(issues, 'BOUNDARY_COMMITMENT_MISMATCH', historicalEnd + 1n);
      }
    }
  }

  let expectedSequence = 1n;
  let previousHash: string | null = null;
  let chainStarted = false;
  const hashOwners = new Map<string, Array<{ sequence: bigint; historical: boolean }>>();

  for (const entry of entries) {
    const sequence = sequenceOf(entry.sequence);
    if (sequence === null) {
      issue(issues, 'INVALID_SEQUENCE');
      continue;
    }
    const historical = Boolean(historicalStart !== null && historicalEnd !== null && inRange(sequence, historicalStart, historicalEnd));
    const isBoundaryEntry = Boolean(active && incident && sequenceOf(active.startSequence) === sequence);

    if (sequence !== expectedSequence) {
      issue(issues, 'SEQUENCE_GAP_OR_DUPLICATE', sequence);
      expectedSequence = sequence;
    }
    expectedSequence += 1n;

    if (!hasAuditMaterial(entry)) {
      if (!metadataPresent && !chainStarted) {
        legacySkipped += 1;
        continue;
      }
      if (historical) {
        historicalFindings += 1;
        continue;
      }
      issue(issues, 'MISSING_AUDIT_HASH_MATERIAL', sequence);
      continue;
    }

    chainStarted = true;
    checked += 1;
    if (entry.entryHash) {
      hashOwners.set(entry.entryHash, [...(hashOwners.get(entry.entryHash) ?? []), { sequence, historical }]);
    }

    if (entry.hashVersion !== undefined && entry.hashVersion !== null && entry.hashVersion !== 1) {
      if (historical) historicalFindings += 1;
      else issue(issues, 'UNSUPPORTED_HASH_VERSION', sequence);
    }

    const expectedHash = hashAuditEntry(entry.prevHash, canonicalize(entry.canonicalPayload));
    if (entry.entryHash !== expectedHash) {
      if (historical) historicalFindings += 1;
      else issue(issues, 'ENTRY_HASH_MISMATCH', sequence);
    }

    if (isBoundaryEntry && active && incident) {
      if (!isApprovedTrustBoundaryMarker(entry, incident, active)) {
        issue(issues, 'BOUNDARY_MARKER_INVALID', sequence);
      }
    } else if (historical) {
      if (entry.prevHash === null || entry.prevHash !== previousHash) historicalFindings += 1;
    } else if (entry.prevHash !== previousHash) {
      issue(issues, entry.prevHash === null ? 'UNEXPECTED_GENESIS' : 'PREVIOUS_HASH_MISMATCH', sequence);
    }

    previousHash = entry.entryHash ?? null;
  }

  for (const owners of hashOwners.values()) {
    if (owners.length < 2) continue;
    if (owners.every((owner) => owner.historical)) historicalFindings += 1;
    else issue(issues, 'DUPLICATE_ENTRY_HASH');
  }

  if (entries.length > 0 && !chainStarted) issue(issues, 'CHAIN_NEVER_STARTED');

  const last = entries[entries.length - 1];
  const lastSequence = last ? sequenceOf(last.sequence) : 0n;
  if (state) {
    if (sequenceOf(state.lastSequence) !== lastSequence) issue(issues, 'CHAIN_STATE_SEQUENCE_MISMATCH');
    if ((state.lastHash ?? null) !== (last?.entryHash ?? null)) issue(issues, 'CHAIN_STATE_HASH_MISMATCH');
    if (last?.id && state.lastEntryId !== last.id) issue(issues, 'CHAIN_STATE_ENTRY_MISMATCH');
  } else if (entries.length > 0) {
    issue(issues, 'MISSING_CHAIN_STATE');
  }

  if (metadataPresent && incident && historicalStart !== null && historicalEnd !== null) {
    const expectedBoundarySequence = historicalEnd + 1n;
    const boundaryEntry = entries.find((entry) => sequenceOf(entry.sequence) === expectedBoundarySequence);
    if (!boundaryEntry) issue(issues, 'BOUNDARY_MARKER_MISSING', expectedBoundarySequence);
  }

  const status: AuditVerificationStatus = issues.length > 0
    ? 'FAIL'
    : incident
      ? 'PASS_WITH_APPROVED_HISTORICAL_BOUNDARY'
      : 'PASS';

  return {
    ok: status !== 'FAIL',
    status,
    checked,
    totalScanned: entries.length,
    legacySkipped,
    trustedThroughSequence,
    historicalUntrustedRange,
    activeEpoch,
    historicalFindings,
    issues
  };
}
