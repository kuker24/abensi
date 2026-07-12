import { AuditChainService } from './audit-chain.service';
import {
  HISTORICAL_CHAIN_INTEGRITY_LOSS,
  buildTrustBoundaryCanonicalPayload,
  createTrustBoundaryCommitment,
  createTrustBoundaryDescriptor,
  hashAuditEntry,
  verifyAuditTrustBoundary
} from './audit-trust-boundary.core';
import { canonicalize } from './canonical-json';

function entry(sequence: bigint, prevHash: string | null, action = 'audit.test', payload: unknown = { action: 'audit.test' }) {
  const canonicalPayload = canonicalize(payload);
  return {
    id: `audit-${sequence}`,
    sequence,
    action,
    canonicalPayload,
    prevHash,
    entryHash: hashAuditEntry(prevHash, canonicalPayload),
    hashVersion: 1
  };
}

function state(entries: Array<ReturnType<typeof entry>>, activeEpochId: string | null = null) {
  const last = entries.at(-1);
  return {
    id: 1,
    lastSequence: last?.sequence ?? 0n,
    lastHash: last?.entryHash ?? null,
    lastEntryId: last?.id ?? null,
    activeEpochId
  };
}

function approvedBoundaryFixture() {
  const first = entry(1n, null, 'auth.login.success', { action: 'auth.login.success' });
  const second = entry(2n, first.entryHash, 'attendance.scan.accepted', { action: 'attendance.scan.accepted' });
  const historical = entry(3n, second.entryHash, 'identity.user.deleted', { action: 'identity.user.deleted' });
  const historicalTip = entry(4n, historical.entryHash, 'identity.user.deleted', { action: 'identity.user.deleted' });
  const descriptor = createTrustBoundaryDescriptor({
    incidentCode: 'AUDIT_CHAIN_INCIDENT',
    reasonCode: HISTORICAL_CHAIN_INTEGRITY_LOSS,
    previousTrustedEndSequence: 2n,
    historicalUntrustedEndSequence: 4n,
    newEpochNumber: 2
  });
  const commitment = createTrustBoundaryCommitment(historicalTip.entryHash, descriptor);
  const incident = {
    id: 'incident-1',
    incidentCode: descriptor.incidentCode,
    reasonCode: descriptor.reasonCode,
    status: 'HISTORICAL_UNTRUSTED',
    previousTrustedEndSequence: 2n,
    historicalStartSequence: 3n,
    historicalEndSequence: 4n,
    boundaryCommitment: commitment,
    activeEpochId: 'epoch-2',
    approvedAt: new Date('2026-07-12T00:00:00.000Z')
  };
  const boundaryPayload = buildTrustBoundaryCanonicalPayload({ incidentId: incident.id, descriptor });
  const boundary = {
    ...entry(5n, commitment, 'audit.trust_boundary.approved', boundaryPayload),
    resource: 'auditTrustBoundary',
    resourceId: incident.id,
    after: descriptor
  };
  const afterBoundary = entry(6n, boundary.entryHash, 'attendance.scan.accepted', { action: 'attendance.scan.accepted' });
  const entries = [first, second, historical, historicalTip, boundary, afterBoundary];
  const epochs = [
    { id: 'epoch-1', epochNumber: 1, startSequence: 1n, endSequence: 2n, status: 'TRUSTED', previousEpochId: null },
    { id: 'epoch-2', epochNumber: 2, startSequence: 5n, endSequence: null, status: 'ACTIVE_TRUSTED', previousEpochId: 'epoch-1' }
  ];
  return { entries, epochs, incident, descriptor };
}

describe('audit trust-boundary verifier', () => {
  it('accepts normal single-chain behavior and a lazy epoch-one model', () => {
    const first = entry(1n, null);
    const second = entry(2n, first.entryHash);
    const result = verifyAuditTrustBoundary({
      entries: [first, second],
      state: state([first, second], 'epoch-1'),
      epochs: [{ id: 'epoch-1', epochNumber: 1, startSequence: 1n, endSequence: null, status: 'ACTIVE_TRUSTED', previousEpochId: null }],
      incidents: []
    });

    expect(result).toMatchObject({ ok: true, status: 'PASS', activeEpoch: 1 });
  });

  it('classifies approved historical rows as preserved untrusted and validates epoch two boundary', () => {
    const fixture = approvedBoundaryFixture();
    const result = verifyAuditTrustBoundary({
      entries: fixture.entries,
      state: state(fixture.entries, 'epoch-2'),
      epochs: fixture.epochs,
      incidents: [fixture.incident]
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'PASS_WITH_APPROVED_HISTORICAL_BOUNDARY',
      trustedThroughSequence: '2',
      historicalUntrustedRange: { from: '3', to: '4' },
      activeEpoch: 2
    });
  });

  it('reports historical mismatch without converting it into a normal pass', () => {
    const fixture = approvedBoundaryFixture();
    fixture.entries[2].entryHash = 'historical-mismatch';
    const result = verifyAuditTrustBoundary({
      entries: fixture.entries,
      state: state(fixture.entries, 'epoch-2'),
      epochs: fixture.epochs,
      incidents: [fixture.incident]
    });

    expect(result).toMatchObject({ ok: true, status: 'PASS_WITH_APPROVED_HISTORICAL_BOUNDARY' });
    expect(result.historicalFindings).toBeGreaterThan(0);
  });

  it('fails a tampered persisted boundary commitment', () => {
    const fixture = approvedBoundaryFixture();
    fixture.incident.boundaryCommitment = 'tampered-commitment';
    const result = verifyAuditTrustBoundary({
      entries: fixture.entries,
      state: state(fixture.entries, 'epoch-2'),
      epochs: fixture.epochs,
      incidents: [fixture.incident]
    });

    expect(result).toMatchObject({ ok: false, status: 'FAIL' });
    expect(result.issues.map((item) => item.code)).toContain('BOUNDARY_COMMITMENT_MISMATCH');
  });

  it('fails mismatch after approved boundary', () => {
    const fixture = approvedBoundaryFixture();
    fixture.entries[5].entryHash = 'new-mismatch';
    const result = verifyAuditTrustBoundary({
      entries: fixture.entries,
      state: state(fixture.entries, 'epoch-2'),
      epochs: fixture.epochs,
      incidents: [fixture.incident]
    });

    expect(result).toMatchObject({ ok: false, status: 'FAIL' });
    expect(result.issues.map((item) => item.code)).toContain('ENTRY_HASH_MISMATCH');
  });

  it.each([
    ['unexpected genesis', (fixture: ReturnType<typeof approvedBoundaryFixture>) => { fixture.entries[4].prevHash = null; }],
    ['missing sequence', (fixture: ReturnType<typeof approvedBoundaryFixture>) => { fixture.entries[4].sequence = 6n; }],
    ['duplicate sequence', (fixture: ReturnType<typeof approvedBoundaryFixture>) => { fixture.entries[4].sequence = 4n; }],
    ['missing boundary incident', (fixture: ReturnType<typeof approvedBoundaryFixture>) => { fixture.incident.activeEpochId = 'other-epoch'; }]
  ])('fails %s', (_name, mutate) => {
    const fixture = approvedBoundaryFixture();
    mutate(fixture);
    const result = verifyAuditTrustBoundary({
      entries: fixture.entries,
      state: state(fixture.entries, 'epoch-2'),
      epochs: fixture.epochs,
      incidents: [fixture.incident]
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('FAIL');
  });

  it('keeps API verifier output sanitized', async () => {
    const fixture = approvedBoundaryFixture();
    const prisma = {
      auditEntry: { findMany: jest.fn().mockResolvedValue(fixture.entries) },
      auditChainState: { findUnique: jest.fn().mockResolvedValue(state(fixture.entries, 'epoch-2')) },
      auditChainEpoch: { findMany: jest.fn().mockResolvedValue(fixture.epochs) },
      auditIntegrityIncident: { findMany: jest.fn().mockResolvedValue([fixture.incident]) }
    } as any;
    const result = await new AuditChainService(prisma).integritySummary();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('canonicalPayload');
    expect(serialized).not.toContain('entryHash');
    expect(serialized).not.toContain(fixture.entries[0].entryHash);
  });
});
