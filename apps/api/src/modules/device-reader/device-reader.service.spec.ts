import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeviceReaderStatus, ReaderType, Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readerCredentialDigest } from '../security/device-signature.service';
import { DeviceReaderService } from './device-reader.service';

function makeAuditClient() {
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

function makePrisma() {
  const tx = {
    ...makeAuditClient(),
    deviceReader: {
      create: jest.fn(async ({ data }) => ({ id: data.id ?? 'reader-1', status: data.status ?? DeviceReaderStatus.ACTIVE, type: data.type ?? ReaderType.GATE, allowedModes: data.allowedModes ?? [], ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'reader-1', deviceId: 'android-1', name: 'Android', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [], provisioningTokenHash: null, readerSecretCiphertext: 'enc-secret' }),
      update: jest.fn()
    }
  };
  const prisma = {
    deviceReader: {
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn()
    },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
    __tx: tx
  } as any;
  return prisma;
}

function makeSignatures() {
  return {
    generateReaderSecret: jest.fn(() => 'shrsec_test-reader-secret'),
    encryptSecret: jest.fn((secret: string) => `enc:${secret}`)
  } as any;
}

describe('DeviceReaderService credential security', () => {
  const actor = { sub: 'admin-1', role: Role.ADMIN_TU };
  const originalReaderSecret = process.env.READER_SECRET_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.READER_SECRET_ENCRYPTION_KEY = 'test-reader-secret-material-that-is-long-enough';
  });

  afterEach(() => {
    if (originalReaderSecret === undefined) delete process.env.READER_SECRET_ENCRYPTION_KEY;
    else process.env.READER_SECRET_ENCRYPTION_KEY = originalReaderSecret;
    jest.clearAllMocks();
  });

  it('stores new reader API keys as HMAC-SHA-256 and never plaintext or plain SHA-256', async () => {
    const prisma = makePrisma();
    const service = new DeviceReaderService(prisma, makeSignatures());

    await service.createReader({ name: 'Gate Reader', type: ReaderType.GATE }, actor);

    const data = prisma.__tx.deviceReader.create.mock.calls[0][0].data;
    expect(data.apiKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.apiKeyHash).not.toBe(data.keyPrefix);
    expect(data.apiKeyHash).not.toBe(createHash('sha256').update(`${data.keyPrefix}${data.keyLast4}`).digest('hex'));
  });

  it('stores new provisioning token as HMAC-SHA-256 deterministic digest', async () => {
    const prisma = makePrisma();
    const service = new DeviceReaderService(prisma, makeSignatures());

    const result = await service.startAndroidProvision({ name: 'Android Reader' }, actor);
    const data = prisma.__tx.deviceReader.create.mock.calls[0][0].data;

    expect(data.provisioningTokenHash).toBe(readerCredentialDigest(result.provisionToken));
    expect(data.provisioningTokenHash).not.toBe(createHash('sha256').update(result.provisionToken).digest('hex'));
    expect(data.provisioningTokenHash).not.toBe(result.provisionToken);
  });

  it('completes provisioning with current HMAC token and clears token atomically', async () => {
    const prisma = makePrisma();
    const signatures = makeSignatures();
    const token = 'shrp_currentProvisionToken_12345';
    const reader = { id: 'reader-1', name: 'Pending Android', status: DeviceReaderStatus.INACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [], provisioningTokenHash: readerCredentialDigest(token), provisioningExpiresAt: new Date(Date.now() + 60_000) };
    prisma.deviceReader.findMany.mockResolvedValue([reader]);
    const service = new DeviceReaderService(prisma, signatures);

    await service.completeAndroidProvision({ provisionToken: token, deviceId: 'android-1' });

    expect(prisma.deviceReader.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
    expect(prisma.__tx.deviceReader.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'reader-1', provisioningTokenHash: { in: expect.arrayContaining([readerCredentialDigest(token), createHash('sha256').update(token).digest('hex')]) } }),
      data: expect.objectContaining({ status: DeviceReaderStatus.ACTIVE, provisioningTokenHash: null, provisioningExpiresAt: null })
    }));
  });

  it('supports legacy SHA-256 provisioning token once without storing new legacy hashes', async () => {
    const prisma = makePrisma();
    const token = 'shrp_legacyProvisionToken_12345';
    const legacyHash = createHash('sha256').update(token).digest('hex');
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-legacy', name: 'Legacy', status: DeviceReaderStatus.INACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [], provisioningTokenHash: legacyHash, provisioningExpiresAt: new Date(Date.now() + 60_000) }]);
    prisma.__tx.deviceReader.findUniqueOrThrow.mockResolvedValue({ id: 'reader-legacy', deviceId: 'android-legacy', name: 'Legacy', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [], provisioningTokenHash: null });
    const service = new DeviceReaderService(prisma, makeSignatures());

    const result = await service.completeAndroidProvision({ provisionToken: token, deviceId: 'android-legacy' });

    expect(result.readerId).toBe('reader-legacy');
    expect(prisma.__tx.deviceReader.updateMany.mock.calls[0][0].where.provisioningTokenHash.in).toEqual([readerCredentialDigest(token), legacyHash]);
  });

  it('rejects empty, whitespace, malformed, and oversized provisioning tokens without accepting a candidate', async () => {
    const prisma = makePrisma();
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.completeAndroidProvision({ provisionToken: '   ', deviceId: 'android-1' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.completeAndroidProvision({ provisionToken: 'invalid-token', deviceId: 'android-1' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.completeAndroidProvision({ provisionToken: `shrp_${'a'.repeat(200)}`, deviceId: 'android-1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.deviceReader.findMany).not.toHaveBeenCalled();
  });

  it('rejects invalid Android device identifiers before provisioning lookup side effects', async () => {
    const prisma = makePrisma();
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.completeAndroidProvision({ provisionToken: 'shrp_validProvisionToken_12345', deviceId: 'x'.repeat(257) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails closed when current and legacy provisioning digests match different records', async () => {
    const prisma = makePrisma();
    const token = 'shrp_ambiguousProvisionToken_12345';
    prisma.deviceReader.findMany.mockResolvedValue([
      { id: 'reader-current', provisioningTokenHash: readerCredentialDigest(token), status: DeviceReaderStatus.INACTIVE, provisioningExpiresAt: new Date(Date.now() + 60_000) },
      { id: 'reader-legacy', provisioningTokenHash: createHash('sha256').update(token).digest('hex'), status: DeviceReaderStatus.INACTIVE, provisioningExpiresAt: new Date(Date.now() + 60_000) }
    ]);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.completeAndroidProvision({ provisionToken: token, deviceId: 'android-1' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.__tx.deviceReader.updateMany).not.toHaveBeenCalled();
  });

  it('rejects expired, revoked, and reused/raced provisioning tokens fail-closed', async () => {
    const token = 'shrp_stateProvisionToken_12345';
    const expired = makePrisma();
    expired.deviceReader.findMany.mockResolvedValue([{ id: 'reader-expired', provisioningTokenHash: readerCredentialDigest(token), status: DeviceReaderStatus.INACTIVE, provisioningExpiresAt: new Date(Date.now() - 1000) }]);
    await expect(new DeviceReaderService(expired, makeSignatures()).completeAndroidProvision({ provisionToken: token, deviceId: 'android-1' })).rejects.toBeInstanceOf(ForbiddenException);

    const revoked = makePrisma();
    revoked.deviceReader.findMany.mockResolvedValue([{ id: 'reader-revoked', provisioningTokenHash: readerCredentialDigest(token), status: DeviceReaderStatus.REVOKED, provisioningExpiresAt: new Date(Date.now() + 60_000) }]);
    await expect(new DeviceReaderService(revoked, makeSignatures()).completeAndroidProvision({ provisionToken: token, deviceId: 'android-1' })).rejects.toBeInstanceOf(ForbiddenException);

    const raced = makePrisma();
    raced.deviceReader.findMany.mockResolvedValue([{ id: 'reader-raced', name: 'Raced', provisioningTokenHash: readerCredentialDigest(token), status: DeviceReaderStatus.INACTIVE, provisioningExpiresAt: new Date(Date.now() + 60_000) }]);
    raced.__tx.deviceReader.updateMany.mockResolvedValue({ count: 0 });
    await expect(new DeviceReaderService(raced, makeSignatures()).completeAndroidProvision({ provisionToken: token, deviceId: 'android-1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails closed for ambiguous getStatus matches instead of returning the first candidate', async () => {
    const prisma = makePrisma();
    const identifier = 'shr_reader_status_collision';
    prisma.deviceReader.findMany.mockResolvedValue([
      { id: identifier, apiKeyHash: readerCredentialDigest('other') },
      { id: 'reader-hash', apiKeyHash: readerCredentialDigest(identifier) }
    ]);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.getStatus(identifier)).rejects.toBeInstanceOf(NotFoundException);
  });
});
