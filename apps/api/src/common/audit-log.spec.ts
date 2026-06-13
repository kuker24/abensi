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
});
