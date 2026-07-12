import { Role } from '@prisma/client';
import { AuditService } from './audit.service';

function makePrisma(overrides: { count?: number; items?: any[]; epochs?: any[]; incidents?: any[] } = {}) {
  return {
    auditEntry: {
      count: jest.fn().mockResolvedValue(overrides.count ?? overrides.items?.length ?? 0),
      findMany: jest.fn().mockResolvedValue(overrides.items ?? [])
    },
    auditChainEpoch: {
      findMany: jest.fn().mockResolvedValue(overrides.epochs ?? [])
    },
    auditIntegrityIncident: {
      findMany: jest.fn().mockResolvedValue(overrides.incidents ?? [])
    }
  } as any;
}

const pagination = { page: 1, limit: 50, skip: 0 };

describe('AuditService', () => {
  it('returns a normal empty paginated result when no audit entries exist', async () => {
    const prisma = makePrisma({ count: 0, items: [] });
    const service = new AuditService(prisma);

    const result = await service.list(pagination, {});

    expect(result.items).toEqual([]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 50,
      total: 0,
      totalPages: 1,
      hasNext: false,
      hasPrev: false
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('serializes AuditEntry.sequence BigInt and omits hash material from API data', async () => {
    const prisma = makePrisma({
      count: 1,
      items: [{
        id: 'audit-1',
        sequence: 1n,
        actorId: 'admin-1',
        actorRole: Role.ADMIN_TU,
        action: 'identity.user.updated',
        module: 'identity',
        resource: 'user',
        resourceId: 'user-1',
        reason: 'Unit test',
        requestIp: null,
        requestDevice: null,
        before: null,
        after: { active: false },
        canonicalPayload: { action: 'identity.user.updated' },
        prevHash: null,
        entryHash: 'hash-1',
        hashVersion: 1,
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
        actor: { id: 'admin-1', fullName: 'Admin TU', username: 'admin.tu', role: Role.ADMIN_TU }
      }],
      epochs: [{ epochNumber: 1, startSequence: 1n, endSequence: null, status: 'ACTIVE_TRUSTED' }]
    });
    const service = new AuditService(prisma);

    const result = await service.list(pagination, {});

    expect(result.items[0].sequence).toBe('1');
    expect(result.items[0].actor).toEqual({ id: 'admin-1', fullName: 'Admin TU', username: 'admin.tu', role: Role.ADMIN_TU });
    expect(result.items[0]).toMatchObject({ trustClassification: 'DECLARED_TRUSTED_EPOCH', epochNumber: 1, isBoundaryMarker: false });
    expect(result.items[0]).not.toHaveProperty('canonicalPayload');
    expect(result.items[0]).not.toHaveProperty('entryHash');
    expect(result.items[0]).not.toHaveProperty('prevHash');
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('classifies historical and boundary entries from small metadata reads without exposing boundary descriptor', async () => {
    const prisma = makePrisma({
      count: 2,
      items: [
        {
          id: 'historical', sequence: 3n, actorId: null, actorRole: null, action: 'identity.user.deleted', module: 'identity', resource: 'user', resourceId: 'user-1', reason: null,
          requestIp: null, requestDevice: null, before: { private: 'old' }, after: { private: 'old' }, canonicalPayload: { raw: true }, prevHash: 'hidden', entryHash: 'hidden', hashVersion: 1, createdAt: new Date(), actor: null
        },
        {
          id: 'boundary', sequence: 4n, actorId: null, actorRole: null, action: 'audit.trust_boundary.approved', module: 'security', resource: 'auditTrustBoundary', resourceId: 'incident-1', reason: 'AUDIT_CHAIN_INCIDENT',
          requestIp: null, requestDevice: 'system:audit-trust-boundary', before: null, after: { marker: 'AUDIT_TRUST_BOUNDARY', incidentCode: 'AUDIT_CHAIN_INCIDENT', privateHash: 'must-hide' }, canonicalPayload: { raw: true }, prevHash: 'hidden', entryHash: 'hidden', hashVersion: 1, createdAt: new Date(), actor: null
        }
      ],
      epochs: [
        { epochNumber: 1, startSequence: 1n, endSequence: 2n, status: 'TRUSTED' },
        { epochNumber: 2, startSequence: 4n, endSequence: null, status: 'ACTIVE_TRUSTED' }
      ],
      incidents: [{ historicalStartSequence: 3n, historicalEndSequence: 3n, status: 'HISTORICAL_UNTRUSTED' }]
    });
    const service = new AuditService(prisma);

    const result = await service.list(pagination, {});

    expect(result.items[0]).toMatchObject({ trustClassification: 'DECLARED_HISTORICAL_UNTRUSTED', epochNumber: null, isBoundaryMarker: false });
    expect(result.items[1]).toMatchObject({ trustClassification: 'BOUNDARY_MARKER', epochNumber: 2, isBoundaryMarker: true, before: null, after: { marker: 'AUDIT_TRUST_BOUNDARY' } });
    expect(JSON.stringify(result.items[1])).not.toContain('privateHash');
    expect(prisma.auditChainEpoch.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditIntegrityIncident.findMany).toHaveBeenCalledTimes(1);
  });

  it('uses declared metadata wording even when an underlying row is corrupted', async () => {
    const prisma = makePrisma({
      count: 1,
      items: [{
        id: 'audit-corrupt', sequence: 1n, actorId: null, actorRole: null, action: 'system.test', module: 'system', resource: 'test', resourceId: 'test-1', reason: null,
        requestIp: null, requestDevice: null, before: null, after: null, canonicalPayload: { private: true }, prevHash: null, entryHash: 'corrupt-hash', hashVersion: 1, createdAt: new Date(), actor: null
      }],
      epochs: [{ epochNumber: 1, startSequence: 1n, endSequence: null, status: 'ACTIVE_TRUSTED' }]
    });

    const result = await new AuditService(prisma).list(pagination, {});

    expect(result.items[0].trustClassification).toBe('DECLARED_TRUSTED_EPOCH');
    expect(JSON.stringify(result.items[0])).not.toContain('CRYPTOGRAPHICALLY_VALID');
    expect(JSON.stringify(result.items[0])).not.toContain('corrupt-hash');
  });

  it('marks legacy audit rows as pending when no trust metadata exists', async () => {
    const prisma = makePrisma({
      count: 1,
      items: [{
        id: 'audit-legacy', sequence: 1n, actorId: null, actorRole: null, action: 'system.test', module: 'system', resource: 'test', resourceId: 'test-1', reason: null,
        requestIp: null, requestDevice: null, before: null, after: null, canonicalPayload: null, prevHash: null, entryHash: null, hashVersion: 1, createdAt: new Date(), actor: null
      }]
    });

    const result = await new AuditService(prisma).list(pagination, {});

    expect(result.items[0]).toMatchObject({ trustClassification: 'LEGACY_METADATA_PENDING', epochNumber: null, isBoundaryMarker: false });
  });

  it('recursively serializes BigInt values inside non-boundary audit JSON payloads', async () => {
    const prisma = makePrisma({
      count: 1,
      items: [{
        id: 'audit-2',
        sequence: 2n,
        actorId: null,
        actorRole: null,
        action: 'system.test',
        module: 'system',
        resource: 'test',
        resourceId: 'test-1',
        reason: null,
        requestIp: null,
        requestDevice: null,
        before: { count: 3n, nested: { values: [4n, 'ok'] } },
        after: [{ id: 5n }, null],
        canonicalPayload: { sequence: 6n, deep: { value: 7n } },
        prevHash: null,
        entryHash: 'hash-2',
        hashVersion: 1,
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
        actor: null
      }]
    });
    const service = new AuditService(prisma);

    const result = await service.list(pagination, {});

    expect(result.items[0].before).toEqual({ count: '3', nested: { values: ['4', 'ok'] } });
    expect(result.items[0].after).toEqual([{ id: '5' }, null]);
    expect(result.items[0]).not.toHaveProperty('canonicalPayload');
    expect(result.items[0].actor).toBeNull();
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
