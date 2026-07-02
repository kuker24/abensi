import { QrCredentialStatus, Role } from '@prisma/client';
import { QrCredentialsService } from './qr-credentials.service';

const actor = { sub: 'admin-tu-1', role: Role.ADMIN_TU };
const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function auditClient() {
  return {
    auditEntry: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      findMany: jest.fn().mockResolvedValue([])
    },
    auditChainState: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({})
    },
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined)
  };
}

function makeCredential(data: Record<string, unknown>) {
  return {
    id: `credential-${String(data.userId)}`,
    status: QrCredentialStatus.ACTIVE,
    issuedAt: new Date(),
    revokedAt: null,
    lastUsedAt: null,
    user: {
      id: data.userId,
      fullName: 'Nama Pengguna',
      username: '1234567890',
      role: Role.SISWA,
      active: true,
      enrollments: []
    },
    ...data
  };
}

function makePrisma(options: { user?: Record<string, unknown> | null; users?: Array<Record<string, unknown>> } = {}) {
  const user = options.user ?? { id: 'student-1', fullName: 'Siswa Satu', username: '1234567890', role: Role.SISWA, active: true };
  const tx = {
    ...auditClient(),
    qrCredential: {
      create: jest.fn(async ({ data }) => makeCredential(data)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(async ({ data }) => ({ id: 'credential-old', userId: 'student-1', status: QrCredentialStatus.REVOKED, ...data }))
    }
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      findMany: jest.fn().mockResolvedValue(options.users ?? [])
    },
    qrCredential: {
      findFirst: jest.fn().mockResolvedValue({ id: 'credential-old', userId: 'student-1', status: QrCredentialStatus.ACTIVE })
    },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
    __tx: tx
  } as any;
  return prisma;
}

function makeSignatures() {
  return {
    encryptSecret: jest.fn((value: string) => `enc:${value}`),
    decryptSecret: jest.fn((value: string) => value.replace(/^enc:/, ''))
  } as any;
}

describe('QrCredentialsService stable student identity cards', () => {
  afterEach(() => jest.clearAllMocks());

  it('keeps student QR credentials long-lived even when an expiry is submitted', async () => {
    const prisma = makePrisma({ user: { id: 'student-1', fullName: 'Siswa Satu', username: '1234567890', role: Role.SISWA, active: true } });
    const service = new QrCredentialsService(prisma, makeSignatures());

    await service.generateForUser('student-1', { label: 'QR SIAB2', expiresAt: futureExpiry }, actor);

    const data = prisma.__tx.qrCredential.create.mock.calls[0][0].data;
    expect(data.userId).toBe('student-1');
    expect(data.expiresAt).toBeNull();
  });

  it('still allows optional expiry for non-student QR credentials', async () => {
    const prisma = makePrisma({ user: { id: 'teacher-1', fullName: 'Guru Satu', username: 'guru1', role: Role.GURU_MAPEL, active: true } });
    const service = new QrCredentialsService(prisma, makeSignatures());

    await service.generateForUser('teacher-1', { label: 'QR SIAB2', expiresAt: futureExpiry }, actor);

    const data = prisma.__tx.qrCredential.create.mock.calls[0][0].data;
    expect(data.userId).toBe('teacher-1');
    expect(data.expiresAt).toEqual(new Date(futureExpiry));
  });

  it('applies the long-lived student policy during bulk generation', async () => {
    const prisma = makePrisma({
      users: [
        { id: 'student-1', fullName: 'Siswa Satu', role: Role.SISWA },
        { id: 'teacher-1', fullName: 'Guru Satu', role: Role.GURU_MAPEL }
      ]
    });
    const service = new QrCredentialsService(prisma, makeSignatures());

    await service.bulkGenerate({ label: 'QR SIAB2', expiresAt: futureExpiry }, actor);

    const calls = prisma.__tx.qrCredential.create.mock.calls.map((call: any[]) => call[0].data);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ userId: 'student-1', expiresAt: null });
    expect(calls[1].userId).toBe('teacher-1');
    expect(calls[1].expiresAt).toEqual(new Date(futureExpiry));
  });

  it('keeps rotated student replacement QR credentials long-lived', async () => {
    const prisma = makePrisma({ user: { id: 'student-1', fullName: 'Siswa Satu', username: '1234567890', role: Role.SISWA, active: true } });
    const service = new QrCredentialsService(prisma, makeSignatures());

    await service.rotateForUser('student-1', { label: 'QR SIAB2', expiresAt: futureExpiry, reason: 'Kartu hilang/rusak.' }, actor);

    const data = prisma.__tx.qrCredential.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'student-1', expiresAt: null, rotatedFromId: 'credential-old' });
  });
});
