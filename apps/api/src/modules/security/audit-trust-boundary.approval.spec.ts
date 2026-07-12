import { approveAuditTrustBoundary, validateAuditTrustBoundaryApprovalInput } from './audit-trust-boundary.approval';
import { hashAuditEntry } from './audit-trust-boundary.core';

function syntheticEntry(sequence: bigint, prevHash: string | null) {
  const canonicalPayload = { action: `synthetic.${sequence}` };
  return {
    id: `audit-${sequence}`,
    sequence,
    action: 'synthetic.event',
    canonicalPayload,
    prevHash,
    entryHash: hashAuditEntry(prevHash, canonicalPayload),
    hashVersion: 1
  };
}

function makePrisma(overrides: { entries?: ReturnType<typeof syntheticEntry>[]; state?: any; epochs?: any[]; incidents?: any[]; transaction?: any } = {}) {
  const first = syntheticEntry(1n, null);
  const second = syntheticEntry(2n, first.entryHash);
  const entries = overrides.entries ?? [first, second];
  const state = overrides.state ?? {
    id: 1,
    lastSequence: 2n,
    lastHash: second.entryHash,
    lastEntryId: second.id,
    activeEpochId: null
  };
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    auditEntry: {
      findMany: jest.fn(async (args: any = {}) => {
        const candidate = args.where?.sequence?.equals;
        if (candidate !== undefined) return entries.filter((entry) => entry.sequence === candidate);
        const lte = args.where?.sequence?.lte;
        return lte === undefined ? entries : entries.filter((entry) => entry.sequence <= lte);
      }),
      create: jest.fn().mockResolvedValue({ id: 'audit-boundary' })
    },
    auditChainState: {
      findUnique: jest.fn().mockResolvedValue(state),
      update: jest.fn().mockResolvedValue(undefined)
    },
    auditChainEpoch: {
      findMany: jest.fn().mockResolvedValue(overrides.epochs ?? []),
      create: jest.fn()
        .mockResolvedValueOnce({ id: 'epoch-1', epochNumber: 1 })
        .mockResolvedValueOnce({ id: 'epoch-2', epochNumber: 2 }),
      update: jest.fn().mockResolvedValue(undefined)
    },
    auditIntegrityIncident: {
      findMany: jest.fn().mockResolvedValue(overrides.incidents ?? []),
      create: jest.fn().mockResolvedValue({ id: 'incident-1' })
    }
  };
  return {
    tx,
    prisma: {
      $transaction: overrides.transaction ?? jest.fn(async (callback: any) => callback(tx))
    }
  };
}

function anomalousApprovalFixture() {
  const first = syntheticEntry(1n, null);
  const historical = syntheticEntry(2n, first.entryHash);
  historical.entryHash = 'historical-mismatch';
  return {
    entries: [first, historical],
    state: { id: 1, lastSequence: 2n, lastHash: historical.entryHash, lastEntryId: historical.id, activeEpochId: null }
  };
}

const input = {
  incidentCode: 'AUDIT_CHAIN_INCIDENT',
  expectedLatestSequence: 2n,
  expectedLastTrustedSequence: 1n,
  approvalReference: 'CHG-AUDIT-001',
  dryRun: true,
  confirm: false
};

describe('approveAuditTrustBoundary', () => {
  it('defaults to dry-run and performs zero writes', async () => {
    const { prisma, tx } = makePrisma(anomalousApprovalFixture());
    const result = await approveAuditTrustBoundary(prisma as any, input);

    expect(result).toMatchObject({ ok: true, dryRun: true, status: 'DRY_RUN', boundarySequence: '3' });
    expect(tx.auditChainEpoch.create).not.toHaveBeenCalled();
    expect(tx.auditIntegrityIncident.create).not.toHaveBeenCalled();
    expect(tx.auditEntry.create).not.toHaveBeenCalled();
    expect(tx.auditChainState.update).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation for write mode', async () => {
    const { prisma } = makePrisma(anomalousApprovalFixture());
    const result = await approveAuditTrustBoundary(prisma as any, { ...input, dryRun: false, confirm: false });

    expect(result).toMatchObject({ ok: false, status: 'REJECTED', reason: 'CONFIRMATION_REQUIRED' });
  });

  it('rejects arbitrary approval reference text and accepts sanitized ticket ID only', () => {
    expect(validateAuditTrustBoundaryApprovalInput({ ...input, approvalReference: 'owner said yes' })).toBe('APPROVAL_REFERENCE_INVALID');
    expect(validateAuditTrustBoundaryApprovalInput(input)).toBeNull();
  });

  it('rejects double approval and changed state precondition', async () => {
    const double = makePrisma({ ...anomalousApprovalFixture(), epochs: [{ id: 'epoch-1' }] });
    await expect(approveAuditTrustBoundary(double.prisma as any, input)).resolves.toMatchObject({ ok: false, reason: 'BOUNDARY_ALREADY_EXISTS' });

    const changed = makePrisma({ ...anomalousApprovalFixture(), state: { id: 1, lastSequence: 3n, lastHash: 'tip', lastEntryId: 'audit-3', activeEpochId: null } });
    await expect(approveAuditTrustBoundary(changed.prisma as any, input)).resolves.toMatchObject({ ok: false, reason: 'LATEST_SEQUENCE_PRECONDITION_CHANGED' });
  });

  it.each([
    ['global gap', [syntheticEntry(1n, null), syntheticEntry(3n, 'incorrect')]],
    ['global duplicate', [syntheticEntry(1n, null), syntheticEntry(1n, null)]]
  ])('rejects %s precondition anywhere in global sequence range', async (_name, entries) => {
    const last = entries.at(-1);
    const { prisma } = makePrisma({
      entries,
      state: { id: 1, lastSequence: 2n, lastHash: last?.entryHash ?? 'tip', lastEntryId: last?.id ?? 'audit-tip', activeEpochId: null }
    });
    await expect(approveAuditTrustBoundary(prisma as any, input)).resolves.toMatchObject({
      ok: false,
      reason: 'GLOBAL_SEQUENCE_CONTINUITY_PRECONDITION_CHANGED'
    });
  });

  it('rejects changed preconditions in historical range even when global continuity holds', async () => {
    const first = syntheticEntry(1n, null);
    const historical = syntheticEntry(2n, first.entryHash);
    const { prisma } = makePrisma({
      entries: [first, historical],
      state: { id: 1, lastSequence: 2n, lastHash: historical.entryHash, lastEntryId: 'other-tip', activeEpochId: null }
    });
    await expect(approveAuditTrustBoundary(prisma as any, input)).resolves.toMatchObject({
      ok: false,
      reason: 'PERSISTED_TIP_PRECONDITION_CHANGED'
    });
  });

  it.each([
    ['missing canonical material', (first: ReturnType<typeof syntheticEntry>) => ({ ...first, canonicalPayload: null })],
    ['missing hash material', (first: ReturnType<typeof syntheticEntry>) => ({ ...first, entryHash: null })],
    ['unsupported hash version', (first: ReturnType<typeof syntheticEntry>) => ({ ...first, hashVersion: 2 })]
  ])('rejects trusted prefix with %s even when later historical anomaly exists', async (_name, mutateTrusted: (entry: ReturnType<typeof syntheticEntry>) => Record<string, unknown>) => {
    const first = mutateTrusted(syntheticEntry(1n, null)) as any;
    const historical = syntheticEntry(2n, typeof first.entryHash === 'string' ? first.entryHash : null);
    historical.entryHash = 'historical-mismatch';
    const { prisma } = makePrisma({
      entries: [first, historical],
      state: { id: 1, lastSequence: 2n, lastHash: historical.entryHash, lastEntryId: historical.id, activeEpochId: null }
    });

    await expect(approveAuditTrustBoundary(prisma as any, input)).resolves.toMatchObject({
      ok: false,
      reason: 'TRUSTED_SEGMENT_MATERIAL_OR_VERSION_INVALID'
    });
  });

  it('requires first declared historical row to contain a concrete anomaly', async () => {
    const first = syntheticEntry(1n, null);
    const historical = syntheticEntry(2n, first.entryHash);
    historical.entryHash = 'historical-mismatch';
    const historicalFixture = makePrisma({
      entries: [first, historical],
      state: { id: 1, lastSequence: 2n, lastHash: 'historical-mismatch', lastEntryId: historical.id, activeEpochId: null }
    });
    await expect(approveAuditTrustBoundary(historicalFixture.prisma as any, input)).resolves.toMatchObject({
      ok: true,
      status: 'DRY_RUN',
      anomalySummary: { earliestOwnHashMismatch: '2', firstAnomalySequence: '2', issueCodes: ['ENTRY_HASH_MISMATCH'] }
    });

    const healthyFixture = makePrisma();
    await expect(approveAuditTrustBoundary(healthyFixture.prisma as any, input)).resolves.toMatchObject({
      ok: false,
      reason: 'HISTORICAL_ANOMALY_PRECONDITION_NOT_MET'
    });

    const anomalyStartsLater = makePrisma({
      entries: [
        syntheticEntry(1n, null),
        syntheticEntry(2n, hashAuditEntry(null, { action: 'synthetic.1' })),
        { ...syntheticEntry(3n, hashAuditEntry(hashAuditEntry(null, { action: 'synthetic.1' }), { action: 'synthetic.2' })), entryHash: 'late-mismatch' }
      ],
      state: { id: 1, lastSequence: 3n, lastHash: 'late-mismatch', lastEntryId: 'audit-3', activeEpochId: null }
    });
    await expect(approveAuditTrustBoundary(anomalyStartsLater.prisma as any, {
      ...input,
      expectedLatestSequence: 3n,
      expectedLastTrustedSequence: 1n
    })).resolves.toMatchObject({ ok: false, reason: 'HISTORICAL_ANOMALY_PRECONDITION_NOT_MET' });

    const anomalyAfterStart = makePrisma({
      entries: [first, historical, { ...syntheticEntry(3n, 'historical-mismatch'), entryHash: 'another-mismatch' }],
      state: { id: 1, lastSequence: 3n, lastHash: 'another-mismatch', lastEntryId: 'audit-3', activeEpochId: null }
    });
    await expect(approveAuditTrustBoundary(anomalyAfterStart.prisma as any, {
      ...input,
      expectedLatestSequence: 3n,
      expectedLastTrustedSequence: 2n
    })).resolves.toMatchObject({ ok: false, reason: 'TRUSTED_SEGMENT_NOT_CRYPTOGRAPHICALLY_VALID' });
  });

  it('writes atomically only after explicit confirmation', async () => {
    const { prisma, tx } = makePrisma(anomalousApprovalFixture());
    const result = await approveAuditTrustBoundary(prisma as any, { ...input, dryRun: false, confirm: true });

    expect(result).toMatchObject({ ok: true, dryRun: false, status: 'APPROVED' });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(389551911)');
    expect(tx.auditChainEpoch.create).toHaveBeenCalledTimes(2);
    expect(tx.auditChainEpoch.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'epoch-1' },
      data: expect.objectContaining({ status: 'TRUSTED', endSequence: 1n, closedAt: expect.any(Date) })
    }));
    expect(tx.auditIntegrityIncident.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reasonCode: 'HISTORICAL_CHAIN_INTEGRITY_LOSS' }) }));
    expect(tx.auditEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.auditChainState.update).toHaveBeenCalledTimes(1);
  });

  it('propagates transaction callback rejection so Prisma rolls back all staged writes', async () => {
    const { tx } = makePrisma(anomalousApprovalFixture());
    tx.auditEntry.create.mockRejectedValueOnce(new Error('synthetic insert failure'));
    const prisma = {
      $transaction: jest.fn(async (callback: any) => callback(tx))
    };

    await expect(approveAuditTrustBoundary(prisma as any, { ...input, dryRun: false, confirm: true })).rejects.toThrow('synthetic insert failure');
    expect(tx.auditChainState.update).not.toHaveBeenCalled();
  });

  it('requests same advisory lock for competing approval attempts; mock does not prove DB serialization', async () => {
    const one = makePrisma(anomalousApprovalFixture());
    const two = makePrisma(anomalousApprovalFixture());
    await Promise.all([
      approveAuditTrustBoundary(one.prisma as any, input),
      approveAuditTrustBoundary(two.prisma as any, input)
    ]);
    expect(one.tx.$executeRawUnsafe).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(389551911)');
    expect(two.tx.$executeRawUnsafe).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(389551911)');
  });

  it('does not expose hashes or approval data in result', async () => {
    const { prisma } = makePrisma(anomalousApprovalFixture());
    const result = await approveAuditTrustBoundary(prisma as any, input);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('entryHash');
    expect(serialized).not.toContain('approvalReference');
    expect(serialized).not.toContain('boundaryCommitment');
  });
});
