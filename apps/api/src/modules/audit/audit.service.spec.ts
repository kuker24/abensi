import { Role } from '@prisma/client';
import { AuditService } from './audit.service';

function makePrisma(overrides: { count?: number; items?: any[] } = {}) {
  return {
    auditEntry: {
      count: jest.fn().mockResolvedValue(overrides.count ?? overrides.items?.length ?? 0),
      findMany: jest.fn().mockResolvedValue(overrides.items ?? [])
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

  it('serializes AuditEntry.sequence BigInt as a string before returning API data', async () => {
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
      }]
    });
    const service = new AuditService(prisma);

    const result = await service.list(pagination, {});

    expect(result.items[0].sequence).toBe('1');
    expect(result.items[0].actor).toEqual({ id: 'admin-1', fullName: 'Admin TU', username: 'admin.tu', role: Role.ADMIN_TU });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('recursively serializes BigInt values inside audit JSON payloads', async () => {
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
    expect(result.items[0].canonicalPayload).toEqual({ sequence: '6', deep: { value: '7' } });
    expect(result.items[0].actor).toBeNull();
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
