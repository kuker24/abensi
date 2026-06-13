import { writeAudit } from './audit-log';
import { Role } from '@prisma/client';

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
        actorRole: Role.OPERATOR_IT
      })
    }));
  });

  it('mengambil PostgreSQL advisory transaction lock sebelum menghitung hash chain', async () => {
    const lock = jest.fn().mockResolvedValue([]);
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const findUnique = jest.fn().mockResolvedValue({ id: 1, lastHash: 'prev', lastEntryId: 'audit-0' });
    const client: any = {
      $queryRawUnsafe: lock,
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
  });
});
