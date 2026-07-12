import { writeAudit } from './audit-log';
import { Role } from '@prisma/client';
import {
  HISTORICAL_CHAIN_INTEGRITY_LOSS,
  buildTrustBoundaryCanonicalPayload,
  createTrustBoundaryCommitment,
  createTrustBoundaryDescriptor,
  hashAuditEntry
} from '../modules/security/audit-trust-boundary.core';

function entry(sequence: bigint, prevHash: string | null, action = 'synthetic.event', payload: unknown = { action: `synthetic.${sequence}` }) {
  const canonicalPayload = payload;
  return {
    id: `audit-${sequence}`,
    sequence,
    action,
    canonicalPayload,
    prevHash,
    entryHash: hashAuditEntry(prevHash, canonicalPayload),
    hashVersion: 1,
    createdAt: new Date()
  };
}

describe('writeAudit synthetic actors', () => {
  it('menyimpan reader actor sebagai requestDevice agar tidak melanggar FK User', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const client: any = {
      auditEntry: { create },
      auditChainState: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() }
    };

    await writeAudit(client, {
      actorId: 'reader:device-1',
      actorRole: Role.OPERATOR_IT,
      action: 'attendance.qr.reader.scan.accepted',
      resource: 'gateLog',
      resourceId: 'gate-1',
      after: { ok: true }
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorId: null,
        requestDevice: 'reader:device-1',
        actorRole: Role.OPERATOR_IT,
        sequence: 1n
      })
    }));
  });

  it('mengambil PostgreSQL advisory transaction lock sebelum menghitung hash chain', async () => {
    const lock = jest.fn().mockResolvedValue(1);
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const findUnique = jest.fn().mockResolvedValue({ id: 1, lastSequence: 41n, lastHash: 'prev', lastEntryId: 'audit-0' });
    const client: any = {
      $executeRawUnsafe: lock,
      auditEntry: { create },
      auditChainState: { findUnique, upsert: jest.fn() }
    };

    await writeAudit(client, {
      actorId: 'user-1',
      actorRole: Role.ADMIN_TU,
      action: 'test.audit.locked',
      resource: 'test',
      resourceId: 'r1'
    });

    expect(lock).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(389551911)');
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(findUnique.mock.invocationCallOrder[0]);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sequence: 42n, prevHash: 'prev' }) }));
  });

  it('rejects broken non-empty chain without epoch metadata before an audit write', async () => {
    const create = jest.fn();
    const client: any = {
      auditEntry: {
        create,
        findMany: jest.fn().mockResolvedValue([{ id: 'audit-1', sequence: 1n, action: 'test', canonicalPayload: { test: true }, prevHash: null, entryHash: 'bad', hashVersion: 1, createdAt: new Date() }])
      },
      auditChainState: { findUnique: jest.fn().mockResolvedValue({ id: 1, lastSequence: 1n, lastHash: 'bad', lastEntryId: 'audit-1', activeEpochId: null }), upsert: jest.fn() },
      auditChainEpoch: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() }
    };

    await expect(writeAudit(client, {
      action: 'test.broken-chain',
      resource: 'test',
      resourceId: 'r1'
    })).rejects.toThrow('strict legacy verification failed');
    expect(create).not.toHaveBeenCalled();
  });

  it('lazy-bootstraps a healthy legacy chain only after complete strict verification', async () => {
    const first = entry(1n, null);
    const second = entry(2n, first.entryHash);
    const epochCreate = jest.fn().mockResolvedValue({ id: 'epoch-1', epochNumber: 1, startSequence: 1n, endSequence: null, status: 'ACTIVE_TRUSTED' });
    const state = { id: 1, lastSequence: 2n, lastHash: second.entryHash, lastEntryId: second.id, activeEpochId: null };
    const client: any = {
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-3' }), findMany: jest.fn().mockResolvedValue([first, second]) },
      auditChainState: { findUnique: jest.fn().mockResolvedValueOnce(state).mockResolvedValueOnce({ ...state, activeEpochId: 'epoch-1' }), upsert: jest.fn() },
      auditChainEpoch: { findMany: jest.fn().mockResolvedValue([]), create: epochCreate }
    };

    await writeAudit(client, { action: 'test.legacy-bootstrap', resource: 'test', resourceId: 'r1' });

    expect(epochCreate).toHaveBeenCalledWith({ data: { epochNumber: 1, startSequence: 1n, status: 'ACTIVE_TRUSTED' } });
    expect(client.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sequence: 3n, prevHash: second.entryHash }) }));
  });

  it('creates epoch one lazily only for a fresh empty chain', async () => {
    const epochCreate = jest.fn().mockResolvedValue({ id: 'epoch-1', epochNumber: 1, startSequence: 1n, endSequence: null, status: 'ACTIVE_TRUSTED' });
    const stateFind = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1, lastSequence: 0n, lastHash: null, lastEntryId: null, activeEpochId: 'epoch-1' });
    const client: any = {
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      auditChainState: { findUnique: stateFind, upsert: jest.fn() },
      auditChainEpoch: { findMany: jest.fn().mockResolvedValue([]), create: epochCreate }
    };

    await writeAudit(client, { action: 'test.fresh-chain', resource: 'test', resourceId: 'r1' });

    expect(epochCreate).toHaveBeenCalledWith({ data: { epochNumber: 1, startSequence: 1n, status: 'ACTIVE_TRUSTED' } });
    expect(client.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sequence: 1n, prevHash: null }) }));
  });

  function approvedEpochTwoClient(mutate?: (fixture: any) => void) {
    const trusted = entry(1n, null);
    const historical = entry(2n, trusted.entryHash);
    historical.entryHash = 'historical-mismatch';
    const descriptor = createTrustBoundaryDescriptor({
      incidentCode: 'AUDIT_CHAIN_INCIDENT',
      reasonCode: HISTORICAL_CHAIN_INTEGRITY_LOSS,
      previousTrustedEndSequence: 1n,
      historicalUntrustedEndSequence: 2n,
      newEpochNumber: 2
    });
    const commitment = createTrustBoundaryCommitment(historical.entryHash, descriptor);
    const incident = {
      id: 'incident-1',
      incidentCode: descriptor.incidentCode,
      reasonCode: descriptor.reasonCode,
      status: 'HISTORICAL_UNTRUSTED',
      previousTrustedEndSequence: 1n,
      historicalStartSequence: 2n,
      historicalEndSequence: 2n,
      boundaryCommitment: commitment,
      activeEpochId: 'epoch-2',
      approvedAt: new Date()
    };
    const canonicalPayload = buildTrustBoundaryCanonicalPayload({ incidentId: incident.id, descriptor });
    const boundary = {
      ...entry(3n, commitment, 'audit.trust_boundary.approved', canonicalPayload),
      resource: 'auditTrustBoundary',
      resourceId: incident.id,
      after: descriptor
    };
    const fixture: any = {
      entries: [trusted, historical, boundary],
      incident,
      state: { id: 1, lastSequence: 3n, lastHash: boundary.entryHash, lastEntryId: boundary.id, activeEpochId: 'epoch-2' },
      epochs: [
        { id: 'epoch-1', epochNumber: 1, startSequence: 1n, endSequence: 1n, status: 'TRUSTED', previousEpochId: null },
        { id: 'epoch-2', epochNumber: 2, startSequence: 3n, endSequence: null, status: 'ACTIVE_TRUSTED', previousEpochId: 'epoch-1' }
      ]
    };
    mutate?.(fixture);
    return {
      auditEntry: {
        create: jest.fn().mockResolvedValue({ id: 'audit-4' }),
        findMany: jest.fn((args: any = {}) => {
          const lower = args.where?.sequence?.gte;
          const upper = args.where?.sequence?.lte;
          return Promise.resolve(lower === undefined || upper === undefined
            ? fixture.entries
            : fixture.entries.filter((candidate: any) => candidate.sequence >= lower && candidate.sequence <= upper));
        })
      },
      auditChainState: { findUnique: jest.fn().mockResolvedValue(fixture.state), upsert: jest.fn() },
      auditChainEpoch: { findMany: jest.fn().mockResolvedValue(fixture.epochs), create: jest.fn() },
      auditIntegrityIncident: { findMany: jest.fn().mockResolvedValue([fixture.incident]) }
    };
  }

  it('writes subsequent entry only after exact persisted approved boundary verification', async () => {
    const client: any = approvedEpochTwoClient();

    await writeAudit(client, { action: 'test.epoch-two', resource: 'test', resourceId: 'r1' });

    expect(client.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sequence: 4n }) }));
  });

  it.each([
    ['tampered payload', (fixture: any) => { fixture.entries[2].canonicalPayload = { tampered: true }; }],
    ['tampered commitment', (fixture: any) => { fixture.incident.boundaryCommitment = 'tampered'; }],
    ['tampered incident link', (fixture: any) => { fixture.incident.activeEpochId = 'other-epoch'; }],
    ['tampered epoch start', (fixture: any) => { fixture.epochs[1].startSequence = 4n; }],
    ['tampered marker hash', (fixture: any) => { fixture.entries[2].entryHash = 'tampered'; }]
  ])('fails closed for %s', async (_name, mutate) => {
    const client: any = approvedEpochTwoClient(mutate);

    await expect(writeAudit(client, { action: 'test.epoch-two-tampered', resource: 'test', resourceId: 'r1' })).rejects.toThrow(/boundary metadata is invalid|no approved boundary marker/);
    expect(client.auditEntry.create).not.toHaveBeenCalled();
  });

  it.each([
    ['post-boundary canonical payload', (fixture: any) => {
      fixture.entries.push({ ...entry(4n, fixture.entries[2].entryHash, 'test.epoch-two', { action: 'safe' }), canonicalPayload: { action: 'tampered' } });
      fixture.state = { ...fixture.state, lastSequence: 4n, lastHash: fixture.entries[3].entryHash, lastEntryId: fixture.entries[3].id };
    }],
    ['post-boundary prevHash', (fixture: any) => {
      fixture.entries.push(entry(4n, 'incorrect-predecessor', 'test.epoch-two'));
      fixture.state = { ...fixture.state, lastSequence: 4n, lastHash: fixture.entries[3].entryHash, lastEntryId: fixture.entries[3].id };
    }],
    ['post-boundary sequence gap', (fixture: any) => {
      fixture.entries.push(entry(5n, fixture.entries[2].entryHash, 'test.epoch-two'));
      fixture.state = { ...fixture.state, lastSequence: 5n, lastHash: fixture.entries[3].entryHash, lastEntryId: fixture.entries[3].id };
    }],
    ['post-boundary unsupported hash version', (fixture: any) => {
      fixture.entries.push({ ...entry(4n, fixture.entries[2].entryHash, 'test.epoch-two'), hashVersion: 2 });
      fixture.state = { ...fixture.state, lastSequence: 4n, lastHash: fixture.entries[3].entryHash, lastEntryId: fixture.entries[3].id };
    }],
    ['post-boundary missing hash material', (fixture: any) => {
      fixture.entries.push({ ...entry(4n, fixture.entries[2].entryHash, 'test.epoch-two'), entryHash: null });
      fixture.state = { ...fixture.state, lastSequence: 4n, lastHash: 'stored-tip', lastEntryId: fixture.entries[3].id };
    }]
  ])('rejects %s during full active-epoch lineage recomputation', async (_name, mutate) => {
    const client: any = approvedEpochTwoClient(mutate);

    await expect(writeAudit(client, { action: 'test.epoch-two-lineage', resource: 'test', resourceId: 'r1' })).rejects.toThrow(/active epoch cryptographic lineage is invalid|state tip is incomplete|boundary metadata is invalid/);
    expect(client.auditEntry.create).not.toHaveBeenCalled();
  });

  it('rejects empty active epoch two without approved boundary marker', async () => {
    const client: any = {
      auditEntry: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      auditChainState: { findUnique: jest.fn().mockResolvedValue({ id: 1, lastSequence: 3n, lastHash: 'historical-tip', lastEntryId: 'audit-3', activeEpochId: 'epoch-2' }), upsert: jest.fn() },
      auditChainEpoch: {
        findMany: jest.fn().mockResolvedValue([{ id: 'epoch-2', epochNumber: 2, startSequence: 4n, endSequence: null, status: 'ACTIVE_TRUSTED', previousEpochId: 'epoch-1' }]),
        create: jest.fn()
      }
    };

    await expect(writeAudit(client, { action: 'test.empty-epoch-two', resource: 'test', resourceId: 'r1' })).rejects.toThrow('no approved boundary marker');
    expect(client.auditEntry.create).not.toHaveBeenCalled();
  });

  it('rejects active epoch state inconsistency before audit write', async () => {
    const client: any = {
      auditEntry: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      auditChainState: { findUnique: jest.fn().mockResolvedValue({ id: 1, lastSequence: 4n, lastHash: 'tip', lastEntryId: 'audit-4', activeEpochId: 'other-epoch' }), upsert: jest.fn() },
      auditChainEpoch: {
        findMany: jest.fn().mockResolvedValue([{ id: 'epoch-2', epochNumber: 2, startSequence: 4n, endSequence: null, status: 'ACTIVE_TRUSTED', previousEpochId: 'epoch-1' }]),
        create: jest.fn()
      }
    };

    await expect(writeAudit(client, { action: 'test.inconsistent-epoch', resource: 'test', resourceId: 'r1' })).rejects.toThrow('active epoch is invalid');
    expect(client.auditEntry.create).not.toHaveBeenCalled();
  });

  it('menolak root Prisma client agar audit sensitif tidak terpisah dari mutation transaction', async () => {
    const previous = process.env.AUDIT_STRICT_ROOT_GUARD;
    process.env.AUDIT_STRICT_ROOT_GUARD = 'true';
    const client: any = {
      $transaction: jest.fn(),
      auditEntry: { create: jest.fn() },
      auditChainState: { findUnique: jest.fn(), upsert: jest.fn() }
    };

    await expect(writeAudit(client, {
      actorId: 'user-1',
      action: 'test.root',
      resource: 'test',
      resourceId: 'r1'
    })).rejects.toThrow('interactive Prisma transaction');
    if (previous === undefined) delete process.env.AUDIT_STRICT_ROOT_GUARD;
    else process.env.AUDIT_STRICT_ROOT_GUARD = previous;
  });
});
