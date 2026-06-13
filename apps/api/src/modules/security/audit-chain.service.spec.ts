import { AuditChainService, hashAuditEntry } from './audit-chain.service';
import { canonicalize } from './canonical-json';

describe('AuditChainService', () => {
  it('memverifikasi hash-chain audit yang valid', async () => {
    const payload1 = canonicalize({ action: 'auth.login.success', resourceId: 'u1' });
    const hash1 = hashAuditEntry(null, payload1);
    const payload2 = canonicalize({ action: 'attendance.reader.gate.scan.accepted', resourceId: 'gate-1' });
    const hash2 = hashAuditEntry(hash1, payload2);
    const prisma = {
      auditEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', canonicalPayload: payload1, prevHash: null, entryHash: hash1 },
          { id: 'a2', canonicalPayload: payload2, prevHash: hash1, entryHash: hash2 }
        ])
      }
    } as any;

    await expect(new AuditChainService(prisma).verify()).resolves.toMatchObject({ ok: true, checked: 2, totalScanned: 2, legacySkipped: 0, brokenCount: 0, lastHash: hash2 });
  });

  it('melewati audit legacy sebelum hash-chain dimulai', async () => {
    const payload1 = canonicalize({ action: 'auth.login.success', resourceId: 'u1' });
    const hash1 = hashAuditEntry(null, payload1);
    const prisma = {
      auditEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'legacy-1', canonicalPayload: null, prevHash: null, entryHash: null },
          { id: 'a1', canonicalPayload: payload1, prevHash: null, entryHash: hash1 }
        ])
      }
    } as any;

    await expect(new AuditChainService(prisma).verify()).resolves.toMatchObject({ ok: true, checked: 1, totalScanned: 2, legacySkipped: 1, brokenCount: 0, lastHash: hash1 });
  });

  it('mendeteksi entry audit yang diubah/tidak cocok hash', async () => {
    const payload1 = canonicalize({ action: 'auth.login.success', resourceId: 'u1' });
    const hash1 = hashAuditEntry(null, payload1);
    const tampered = canonicalize({ action: 'auth.login.success', resourceId: 'u2' });
    const prisma = {
      auditEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', canonicalPayload: tampered, prevHash: null, entryHash: hash1 }
        ])
      }
    } as any;

    const result = await new AuditChainService(prisma).verify();
    expect(result.ok).toBe(false);
    expect(result.brokenCount).toBe(1);
    expect(result.broken[0].id).toBe('a1');
  });
});
