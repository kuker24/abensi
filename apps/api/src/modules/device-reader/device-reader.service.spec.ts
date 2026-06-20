import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AndroidReaderMode, DevicePlatform, DeviceReaderStatus, ReaderType, Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readerCredentialDigest } from '../security/device-signature.service';
import { ANDROID_READER_LIMIT_MESSAGE, DeviceReaderService, MAX_ACTIVE_ANDROID_READERS } from './device-reader.service';

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
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }) => ({ id: data.id ?? 'reader-1', status: data.status ?? DeviceReaderStatus.ACTIVE, type: data.type ?? ReaderType.GATE, allowedModes: data.allowedModes ?? [], ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'reader-1', deviceId: 'android-1', name: 'Android', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY], provisioningTokenHash: null, readerSecretCiphertext: 'enc-secret' }),
      update: jest.fn()
    }
  };
  const prisma = {
    deviceReader: {
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn()
    },
    gateLog: { findFirst: jest.fn().mockResolvedValue(null) },
    prayerAttendanceLog: { findFirst: jest.fn().mockResolvedValue(null) },
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
    expect(data.type).toBe(ReaderType.QR_ANDROID);
    expect(data.allowedModes).toEqual([AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY]);
  });

  it('ignores legacy Android provisioning allowedModes and keeps flexible defaults', async () => {
    const prisma = makePrisma();
    const service = new DeviceReaderService(prisma, makeSignatures());

    await service.startAndroidProvision({ name: 'Android Reader', allowedModes: ['GATE_IN', 'GATE_OUT'] }, actor);
    const data = prisma.__tx.deviceReader.create.mock.calls[0][0].data;

    expect(data.allowedModes).toEqual([AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY]);
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
      data: expect.objectContaining({ status: DeviceReaderStatus.ACTIVE, platform: DevicePlatform.ANDROID, provisioningTokenHash: null, provisioningExpiresAt: null })
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

  it('normalizes QR_ANDROID createReader platform to ANDROID even if client sends HARDWARE and gives flexible modes', async () => {
    const prisma = makePrisma();
    const service = new DeviceReaderService(prisma, makeSignatures());

    await service.createReader({ name: 'HP Scanner 1', type: ReaderType.QR_ANDROID, platform: DevicePlatform.HARDWARE }, actor);

    expect(prisma.__tx.deviceReader.count).toHaveBeenCalledWith({ where: { type: ReaderType.QR_ANDROID, status: DeviceReaderStatus.ACTIVE } });
    expect(prisma.__tx.deviceReader.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: ReaderType.QR_ANDROID, platform: DevicePlatform.ANDROID, allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY] }) }));
  });

  it('normalizes QR_ANDROID createReader missing platform to ANDROID and ignores permanent mode binding', async () => {
    const prisma = makePrisma();
    const service = new DeviceReaderService(prisma, makeSignatures());

    await service.createReader({ name: 'HP Scanner 2', type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.MUSHOLA] }, actor);

    expect(prisma.__tx.deviceReader.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: ReaderType.QR_ANDROID, platform: DevicePlatform.ANDROID, allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY] }) }));
  });

  it('blocks third ACTIVE QR_ANDROID even when client tries non-ANDROID platform', async () => {
    const prisma = makePrisma();
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.createReader({ name: 'HP Ketiga', type: ReaderType.QR_ANDROID, platform: DevicePlatform.HARDWARE }, actor)).rejects.toMatchObject({ message: ANDROID_READER_LIMIT_MESSAGE });
    expect(prisma.__tx.deviceReader.create).not.toHaveBeenCalled();
  });

  it('counts legacy ACTIVE QR_ANDROID rows regardless of platform and ignores inactive/revoked via ACTIVE filter', async () => {
    const prisma = makePrisma();
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.startAndroidProvision({ name: 'HP Pengganti' }, actor)).rejects.toMatchObject({ message: ANDROID_READER_LIMIT_MESSAGE });
    expect(prisma.__tx.deviceReader.count).toHaveBeenCalledWith({ where: { type: ReaderType.QR_ANDROID, status: DeviceReaderStatus.ACTIVE } });
    expect(prisma.__tx.deviceReader.create).not.toHaveBeenCalled();
  });

  it('allows replacement when fewer than two ACTIVE QR_ANDROID readers remain', async () => {
    const prisma = makePrisma();
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS - 1);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await service.startAndroidProvision({ name: 'HP Pengganti' }, actor);

    expect(prisma.__tx.deviceReader.count).toHaveBeenCalledWith({ where: { type: ReaderType.QR_ANDROID, status: DeviceReaderStatus.ACTIVE } });
    expect(prisma.__tx.deviceReader.create).toHaveBeenCalled();
  });

  it('rejects Android provision start when active Android reader limit is full', async () => {
    const prisma = makePrisma();
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.startAndroidProvision({ name: 'HP Ketiga' }, actor)).rejects.toMatchObject({ message: ANDROID_READER_LIMIT_MESSAGE });
    expect(prisma.__tx.deviceReader.create).not.toHaveBeenCalled();
  });

  it('allows Android provision start after active reader slot is available and caps expiry at 60 minutes', async () => {
    const prisma = makePrisma();
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS - 1);
    const service = new DeviceReaderService(prisma, makeSignatures());
    const before = Date.now();

    const result = await service.startAndroidProvision({ name: 'HP Pengganti', expiresInMinutes: 120 }, actor);
    const expiresInMs = new Date(result.expiresAt).getTime() - before;

    expect(prisma.__tx.deviceReader.create).toHaveBeenCalled();
    expect(expiresInMs).toBeGreaterThan(59 * 60_000);
    expect(expiresInMs).toBeLessThanOrEqual(60 * 60_000 + 5000);
  });

  it('rejects Android provision completion when another active reader filled the last slot', async () => {
    const prisma = makePrisma();
    const token = 'shrp_limitProvisionToken_12345';
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-pending', name: 'Pending', status: DeviceReaderStatus.INACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [], provisioningTokenHash: readerCredentialDigest(token), provisioningExpiresAt: new Date(Date.now() + 60_000) }]);
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.completeAndroidProvision({ provisionToken: token, deviceId: 'android-new' })).rejects.toMatchObject({ message: ANDROID_READER_LIMIT_MESSAGE });
    expect(prisma.__tx.deviceReader.updateMany).not.toHaveBeenCalled();
  });

  it('normalizes legacy QR_ANDROID platform when reactivating an inactive reader', async () => {
    const prisma = makePrisma();
    const before = { id: 'reader-inactive', status: DeviceReaderStatus.INACTIVE, type: ReaderType.QR_ANDROID, platform: DevicePlatform.HARDWARE };
    prisma.deviceReader.findUnique.mockResolvedValue(before);
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS - 1);
    prisma.__tx.deviceReader.update.mockResolvedValue({ ...before, status: DeviceReaderStatus.ACTIVE, platform: DevicePlatform.ANDROID });
    const service = new DeviceReaderService(prisma, makeSignatures());

    await service.updateStatus('reader-inactive', { status: DeviceReaderStatus.ACTIVE }, actor);

    expect(prisma.__tx.deviceReader.count).toHaveBeenCalledWith({ where: { type: ReaderType.QR_ANDROID, status: DeviceReaderStatus.ACTIVE, id: { not: 'reader-inactive' } } });
    expect(prisma.__tx.deviceReader.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: DeviceReaderStatus.ACTIVE, platform: DevicePlatform.ANDROID, allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY] } }));
  });

  it('rejects reactivating Android reader when active reader limit is full', async () => {
    const prisma = makePrisma();
    prisma.deviceReader.findUnique.mockResolvedValue({ id: 'reader-inactive', status: DeviceReaderStatus.INACTIVE, type: ReaderType.QR_ANDROID });
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.updateStatus('reader-inactive', { status: DeviceReaderStatus.ACTIVE }, actor)).rejects.toMatchObject({ message: ANDROID_READER_LIMIT_MESSAGE });
    expect(prisma.__tx.deviceReader.update).not.toHaveBeenCalled();
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
