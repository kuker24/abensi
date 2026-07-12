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

function makePrisma(options: { user?: Record<string, unknown> | null; users?: Array<Record<string, unknown>>; credentials?: Array<Record<string, unknown>>; lookupCredential?: Record<string, unknown> | null; classes?: Array<Record<string, unknown>> } = {}) {
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
      findFirst: jest.fn().mockResolvedValue({ id: 'credential-old', userId: 'student-1', status: QrCredentialStatus.ACTIVE }),
      findMany: jest.fn().mockResolvedValue(options.credentials ?? []),
      findUnique: jest.fn().mockResolvedValue(options.lookupCredential ?? null)
    },
    schoolClass: {
      findMany: jest.fn().mockResolvedValue(options.classes ?? [])
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

  it('resolves an active student QR after the student moves to a new class', async () => {
    const qrCode = 'schoolhub:qr:v1:QR_STABLE_AFTER_PROMOTION';
    const prisma = makePrisma({
      lookupCredential: {
        id: 'credential-student-1',
        status: QrCredentialStatus.ACTIVE,
        expiresAt: null,
        user: {
          id: 'student-1',
          fullName: 'Siswa Satu',
          username: '1234567890',
          role: Role.SISWA,
          active: true,
          enrollments: [{ schoolClass: { code: 'XI-A', name: 'Kelas XI A' } }]
        }
      }
    });
    const service = new QrCredentialsService(prisma, makeSignatures());

    const credential = await service.findActiveByQrCode(qrCode);

    expect(credential.user.enrollments[0].schoolClass.code).toBe('XI-A');
    expect(prisma.qrCredential.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: expect.any(Object) }));
  });

  it('does not require class enrollment for card print readiness', async () => {
    const prisma = makePrisma({
      users: [
        { id: 'student-1', role: Role.SISWA, enrollments: [], qrCredentials: [{ id: 'credential-student-1' }] }
      ]
    });
    const service = new QrCredentialsService(prisma, makeSignatures());

    const result = await service.readiness({});

    expect(result).toMatchObject({
      totalTargetUsers: 1,
      totalStudents: 1,
      activeQrCount: 1,
      studentsWithoutClass: 1,
      classRequiredForCards: false,
      readyToPrintCount: 1,
      isReadyToPrint: true
    });
  });

  it('exports student card data with dynamic display class fields for printing', async () => {
    const prisma = makePrisma({
      credentials: [
        {
          id: 'credential-student-1',
          userId: 'student-1',
          status: QrCredentialStatus.ACTIVE,
          label: 'QR SIAB2',
          shortCode: 'ABCDEFGH',
          codeCiphertext: 'enc:schoolhub:qr:v1:QR_ABCDEFGHIJKL',
          issuedAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: null,
          user: {
            id: 'student-1',
            fullName: 'Siswa Satu',
            username: '1234567890',
            role: Role.SISWA,
            active: true,
            cardStatus: 'ACTIVE',
            enrollments: [{ schoolClass: { code: 'X-A', name: 'Kelas X A' } }]
          }
        }
      ]
    });
    const service = new QrCredentialsService(prisma, makeSignatures());

    const result = await service.exportCards({});

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      fullName: 'Siswa Satu',
      nama: 'Siswa Satu',
      username: '1234567890',
      nis: undefined,
      nisn: '1234567890',
      role: Role.SISWA,
      roleLabel: 'SISWA',
      className: 'X-A · Kelas X A',
      classCode: 'X-A',
      level: 'SISWA',
      qrCode: 'schoolhub:qr:v1:QR_ABCDEFGHIJKL',
      qr_value: 'schoolhub:qr:v1:QR_ABCDEFGHIJKL',
      cardSource: 'database',
      isOfficial: true,
      sourceLabel: 'RESMI / DATABASE'
    });
    expect(result.cards[0]).not.toHaveProperty('password');
    expect(result.cards[0]).not.toHaveProperty('passwordHash');
    expect(result.cards[0]).not.toHaveProperty('token');
  });

  it('exports teacher card data as teacher without student-only nisn fallback', async () => {
    const prisma = makePrisma({
      credentials: [
        {
          id: 'credential-teacher-1',
          userId: 'teacher-1',
          status: QrCredentialStatus.ACTIVE,
          label: 'QR SIAB2',
          shortCode: 'TCHR001',
          codeCiphertext: 'enc:schoolhub:qr:v1:QR_ZYXWVUTSRQPO',
          issuedAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: null,
          user: {
            id: 'teacher-1',
            fullName: 'Guru Satu',
            username: 'guru.satu',
            nis: null,
            nip: '198001012006041001',
            role: Role.GURU_MAPEL,
            active: true,
            cardStatus: 'ACTIVE',
            enrollments: []
          }
        }
      ]
    });
    const service = new QrCredentialsService(prisma, makeSignatures());

    const result = await service.exportCards({ userId: 'teacher-1' });

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      fullName: 'Guru Satu',
      username: 'guru.satu',
      role: Role.GURU_MAPEL,
      roleLabel: 'Guru',
      displayRole: 'Guru',
      nis: null,
      nisn: null,
      nip: '198001012006041001',
      className: null,
      classCode: null,
      level: 'Guru / Pegawai MAN 1 Rokan Hulu',
      qr_value: 'schoolhub:qr:v1:QR_ZYXWVUTSRQPO'
    });
  });

  it('filters class card exports to students actively enrolled on the business date', async () => {
    const prisma = makePrisma();
    const service = new QrCredentialsService(prisma, makeSignatures());

    await service.exportCards({ classId: 'class-current' });

    expect(prisma.qrCredential.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        user: expect.objectContaining({
          enrollments: {
            some: expect.objectContaining({
              classId: 'class-current',
              active: true,
              administrativeStatus: 'ACTIVE',
              effectiveFrom: { lte: expect.any(Date) }
            })
          }
        })
      })
    }));
  });
});
