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
      update: jest.fn(async ({ data, where }) => ({ id: where.id ?? 'reader-1', deviceId: 'READER_DEV_TEST_01', name: 'READER_DEV_TEST_01', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: data.allowedModes ?? [], ...data }))
    }
  };
  const prisma = {
    deviceReader: {
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(async ({ data }) => ({ id: 'reader-1', name: 'HP Scanner 1', type: ReaderType.QR_ANDROID, status: DeviceReaderStatus.ACTIVE, deviceId: 'android-1', allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY], ...data }))
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
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    process.env.READER_SECRET_ENCRYPTION_KEY = 'test-reader-secret-material-that-is-long-enough';
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
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

  it('overrides a stale allowedModes DB value with the pinned target modes for READER_IDENTITY_01', async () => {
    const prisma = makePrisma();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-identity', deviceId: 'READER_IDENTITY_01', name: 'READER_IDENTITY_01', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.CHECK_ONLY] }]);
    const service = new DeviceReaderService(prisma, makeSignatures());

    const result = await service.listReaders({ page: 1, limit: 20, skip: 0 } as any);

    expect(result.items[0].allowedModes).toEqual([AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]);
  });

  it('creates a short-lived activation code for an approved PR128 target reader without storing plaintext', async () => {
    const prisma = makePrisma();
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-dev', deviceId: 'READER_DEV_TEST_01', name: 'READER_DEV_TEST_01', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY] }]);
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS - 1);
    const service = new DeviceReaderService(prisma, makeSignatures());

    const result = await service.issueAndroidProvisionCode('READER_DEV_TEST_01', { expiresInMinutes: 10 }, actor);
    const data = prisma.__tx.deviceReader.update.mock.calls[0][0].data;

    expect(result.provisionToken).toMatch(/^shrp_/);
    expect(result.provisioningQr).toBe(`schoolhub:reader-provision:v1:${result.provisionToken}`);
    expect(data.provisioningTokenHash).toBe(readerCredentialDigest(result.provisionToken));
    expect(data.provisioningTokenHash).not.toBe(result.provisionToken);
    expect(data.allowedModes).toEqual([AndroidReaderMode.CHECK_ONLY]);
    expect(data.provisioningExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('supports the approved 4-reader activation mapping', async () => {
    const targets = [
      ['READER_DEV_TEST_01', [AndroidReaderMode.CHECK_ONLY]],
      ['READER_IDENTITY_01', [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]],
      ['READER_GATE_PRAYER_01', [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]],
      ['READER_GATE_PRAYER_02', [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]]
    ] as const;

    for (const [deviceId, modes] of targets) {
      const prisma = makePrisma();
      prisma.deviceReader.findMany.mockResolvedValue([{ id: `id-${deviceId}`, deviceId, name: deviceId, status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY] }]);
      prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS - 1);
      const service = new DeviceReaderService(prisma, makeSignatures());

      await service.issueAndroidProvisionCode(deviceId, {}, actor);

      expect(prisma.__tx.deviceReader.update.mock.calls[0][0].data.allowedModes).toEqual(modes);
    }
  });

  it('rejects activation code creation for non-target or revoked readers', async () => {
    const nonTarget = makePrisma();
    nonTarget.deviceReader.findMany.mockResolvedValue([{ id: 'reader-other', deviceId: 'android-other', name: 'Android Other', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [] }]);
    await expect(new DeviceReaderService(nonTarget, makeSignatures()).issueAndroidProvisionCode('android-other', {}, actor)).rejects.toBeInstanceOf(BadRequestException);

    const revoked = makePrisma();
    revoked.deviceReader.findMany.mockResolvedValue([{ id: 'reader-revoked', deviceId: 'READER_DEV_TEST_01', name: 'READER_DEV_TEST_01', status: DeviceReaderStatus.REVOKED, type: ReaderType.QR_ANDROID, allowedModes: [] }]);
    await expect(new DeviceReaderService(revoked, makeSignatures()).issueAndroidProvisionCode('READER_DEV_TEST_01', {}, actor)).rejects.toBeInstanceOf(ForbiddenException);
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

  it('completes production target activation by creating its secret and returning stable reader deviceId and mapped modes', async () => {
    process.env.NODE_ENV = 'production';
    const prisma = makePrisma();
    const signatures = makeSignatures();
    const token = 'shrp_targetProvisionToken_12345';
    const reader = {
      id: 'reader-identity',
      deviceId: 'READER_IDENTITY_01',
      name: 'READER_IDENTITY_01',
      status: DeviceReaderStatus.INACTIVE,
      type: ReaderType.QR_ANDROID,
      allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY],
      provisioningTokenHash: readerCredentialDigest(token),
      provisioningExpiresAt: new Date(Date.now() + 60_000)
    };
    prisma.deviceReader.findMany.mockResolvedValue([reader]);
    prisma.__tx.deviceReader.findUniqueOrThrow.mockResolvedValue({ ...reader, status: DeviceReaderStatus.ACTIVE, allowedModes: [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA], provisioningTokenHash: null, readerSecretCiphertext: 'enc:shrsec_test-reader-secret' });
    const service = new DeviceReaderService(prisma, signatures);

    const result = await service.completeAndroidProvision({ provisionToken: token, deviceId: 'android-install-id', deviceName: 'HP Operator' });
    const data = prisma.__tx.deviceReader.updateMany.mock.calls[0][0].data;

    expect(data.deviceId).toBe('READER_IDENTITY_01');
    expect(data.name).toBe('READER_IDENTITY_01');
    expect(data.allowedModes).toEqual([AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]);
    expect(data.readerSecretCiphertext).toBe('enc:shrsec_test-reader-secret');
    expect(signatures.generateReaderSecret).toHaveBeenCalledTimes(1);
    expect(signatures.encryptSecret).toHaveBeenCalledWith('shrsec_test-reader-secret');
    expect(result).toMatchObject({ deviceId: 'READER_IDENTITY_01', allowedModes: [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA], readerSecret: 'shrsec_test-reader-secret' });
  });

  it('rejects a reused one-time activation code after it is claimed', async () => {
    const prisma = makePrisma();
    const token = 'shrp_reusedProvisionToken_12345';
    prisma.deviceReader.findMany.mockResolvedValue([{ id: 'reader-used', deviceId: 'READER_GATE_PRAYER_01', name: 'READER_GATE_PRAYER_01', status: DeviceReaderStatus.ACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA], provisioningTokenHash: readerCredentialDigest(token), provisioningExpiresAt: new Date(Date.now() + 60_000) }]);
    prisma.__tx.deviceReader.updateMany.mockResolvedValue({ count: 0 });
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.completeAndroidProvision({ provisionToken: token, deviceId: 'android-install-id' })).rejects.toBeInstanceOf(ConflictException);
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
    raced.deviceReader.findMany.mockResolvedValue([{ id: 'reader-raced', name: 'Raced', type: ReaderType.QR_ANDROID, allowedModes: [], provisioningTokenHash: readerCredentialDigest(token), status: DeviceReaderStatus.INACTIVE, provisioningExpiresAt: new Date(Date.now() + 60_000) }]);
    raced.__tx.deviceReader.updateMany.mockResolvedValue({ count: 0 });
    await expect(new DeviceReaderService(raced, makeSignatures()).completeAndroidProvision({ provisionToken: token, deviceId: 'android-1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps non-production QR_ANDROID creation flexible while normalizing platform to ANDROID', async () => {
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

  it('rejects arbitrary QR_ANDROID creation and legacy provisioning in production', async () => {
    process.env.NODE_ENV = 'production';
    const prisma = makePrisma();
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.createReader({ name: 'HP Scanner liar', type: ReaderType.QR_ANDROID }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.startAndroidProvision({ name: 'HP Scanner liar' }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.__tx.deviceReader.create).not.toHaveBeenCalled();
  });

  it('creates each production QR_ANDROID target inactive with pinned identity and modes, without generating or returning a secret', async () => {
    process.env.NODE_ENV = 'production';
    const targets = [
      ['READER_DEV_TEST_01', [AndroidReaderMode.CHECK_ONLY]],
      ['READER_IDENTITY_01', [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]],
      ['READER_GATE_PRAYER_01', [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]],
      ['READER_GATE_PRAYER_02', [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]]
    ] as const;

    for (const [target, allowedModes] of targets) {
      const prisma = makePrisma();
      const signatures = makeSignatures();
      const service = new DeviceReaderService(prisma, signatures);
      const identity = target === 'READER_DEV_TEST_01' ? { deviceId: target, name: 'Nama bebas diabaikan' } : { name: target };

      const result = await service.createReader({ ...identity, type: ReaderType.QR_ANDROID, allowedModes: [AndroidReaderMode.CHECK_ONLY] }, actor);
      const data = prisma.__tx.deviceReader.create.mock.calls[0][0].data;

      expect(prisma.deviceReader.findUnique).toHaveBeenCalledWith({ where: { deviceId: target } });
      expect(data).toMatchObject({
        name: target,
        deviceId: target,
        status: DeviceReaderStatus.INACTIVE,
        type: ReaderType.QR_ANDROID,
        platform: DevicePlatform.ANDROID,
        allowedModes
      });
      expect(data).not.toHaveProperty('apiKeyHash');
      expect(data).not.toHaveProperty('readerSecretCiphertext');
      expect(data).not.toHaveProperty('readerSecretRotatedAt');
      expect(prisma.__tx.deviceReader.count).not.toHaveBeenCalled();
      expect(signatures.generateReaderSecret).not.toHaveBeenCalled();
      expect(signatures.encryptSecret).not.toHaveBeenCalled();
      expect(result).toMatchObject({ item: { status: DeviceReaderStatus.INACTIVE, hasReaderSecret: false }, message: expect.stringContaining('kode aktivasi') });
      expect(result).not.toHaveProperty('readerSecret');
    }
  });

  it('rejects duplicate production target before creation with activation-code guidance', async () => {
    process.env.NODE_ENV = 'production';
    const prisma = makePrisma();
    prisma.deviceReader.findUnique.mockResolvedValue({ id: 'reader-dev', deviceId: 'READER_DEV_TEST_01' });
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.createReader({ name: 'READER_DEV_TEST_01', type: ReaderType.QR_ANDROID }, actor)).rejects.toMatchObject({ message: expect.stringContaining('kode aktivasi') });
    expect(prisma.__tx.deviceReader.create).not.toHaveBeenCalled();
  });

  it('does not activate an unprovisioned production target', async () => {
    process.env.NODE_ENV = 'production';
    const prisma = makePrisma();
    const signatures = makeSignatures();
    const target = {
      id: 'reader-target-pending',
      name: 'READER_DEV_TEST_01',
      deviceId: 'READER_DEV_TEST_01',
      status: DeviceReaderStatus.INACTIVE,
      type: ReaderType.QR_ANDROID,
      allowedModes: [AndroidReaderMode.CHECK_ONLY],
      readerSecretCiphertext: null
    };
    prisma.deviceReader.findUnique.mockResolvedValue(target);
    const service = new DeviceReaderService(prisma, signatures);

    await expect(service.updateStatus(target.id, { status: DeviceReaderStatus.ACTIVE }, actor)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.__tx.deviceReader.update).not.toHaveBeenCalled();
    expect(signatures.generateReaderSecret).not.toHaveBeenCalled();
    expect(signatures.encryptSecret).not.toHaveBeenCalled();
  });

  it('rejects secret rotation for an unprovisioned production target', async () => {
    process.env.NODE_ENV = 'production';
    const prisma = makePrisma();
    const signatures = makeSignatures();
    const target = {
      id: 'reader-target-pending',
      name: 'READER_DEV_TEST_01',
      deviceId: 'READER_DEV_TEST_01',
      status: DeviceReaderStatus.INACTIVE,
      type: ReaderType.QR_ANDROID,
      allowedModes: [AndroidReaderMode.CHECK_ONLY],
      provisionedAt: null,
      readerSecretCiphertext: null
    };
    prisma.deviceReader.findUnique.mockResolvedValue(target);
    const service = new DeviceReaderService(prisma, signatures);

    await expect(service.rotateApiKey(target.id, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(signatures.generateReaderSecret).not.toHaveBeenCalled();
    expect(signatures.encryptSecret).not.toHaveBeenCalled();
    expect(prisma.__tx.deviceReader.update).not.toHaveBeenCalled();
  });

  it('rejects legacy arbitrary Android provisioning completion in production', async () => {
    process.env.NODE_ENV = 'production';
    const prisma = makePrisma();
    const token = 'shrp_productionLegacyToken_12345';
    prisma.deviceReader.findMany.mockResolvedValue([{
      id: 'reader-legacy',
      name: 'Legacy Android',
      deviceId: 'legacy-android',
      status: DeviceReaderStatus.INACTIVE,
      type: ReaderType.QR_ANDROID,
      allowedModes: [],
      provisioningTokenHash: readerCredentialDigest(token),
      provisioningExpiresAt: new Date(Date.now() + 60_000)
    }]);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.completeAndroidProvision({ provisionToken: token, deviceId: 'android-install-id' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.__tx.deviceReader.updateMany).not.toHaveBeenCalled();
  });

  it('rejects updating or reactivating non-target QR_ANDROID readers in production', async () => {
    process.env.NODE_ENV = 'production';
    const prisma = makePrisma();
    const legacyReader = {
      id: 'reader-legacy',
      name: 'Legacy Android',
      deviceId: 'legacy-android',
      status: DeviceReaderStatus.INACTIVE,
      type: ReaderType.QR_ANDROID,
      allowedModes: [AndroidReaderMode.CHECK_ONLY]
    };
    prisma.deviceReader.findUnique.mockResolvedValue(legacyReader);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.updateReader(legacyReader.id, { name: 'Renamed legacy' }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateStatus(legacyReader.id, { status: DeviceReaderStatus.ACTIVE }, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.__tx.deviceReader.update).not.toHaveBeenCalled();
  });

  it('preserves stable production target identity and modes during metadata update and reactivation', async () => {
    process.env.NODE_ENV = 'production';
    const prisma = makePrisma();
    const target = 'READER_GATE_PRAYER_01';
    const targetModes = [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA];
    const before = {
      id: 'reader-gate-prayer',
      name: target,
      deviceId: target,
      status: DeviceReaderStatus.INACTIVE,
      type: ReaderType.QR_ANDROID,
      platform: DevicePlatform.ANDROID,
      readerSecretCiphertext: 'enc:existing-secret',
      provisionedAt: new Date(),
      allowedModes: [AndroidReaderMode.CHECK_ONLY]
    };
    prisma.deviceReader.findUnique.mockResolvedValue(before);
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS - 1);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await service.updateReader(before.id, { name: 'Tidak boleh dipakai', locationName: 'Mushola utama', allowedModes: [AndroidReaderMode.CHECK_ONLY] }, actor);
    expect(prisma.__tx.deviceReader.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: target, deviceId: target, allowedModes: targetModes, locationName: 'Mushola utama' })
    }));

    await service.updateStatus(before.id, { status: DeviceReaderStatus.ACTIVE }, actor);
    expect(prisma.__tx.deviceReader.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { status: DeviceReaderStatus.ACTIVE, platform: DevicePlatform.ANDROID, allowedModes: targetModes }
    }));
  });

  it('rejects status, metadata, and key rotation changes for revoked readers without writes', async () => {
    const prisma = makePrisma();
    const signatures = makeSignatures();
    const revoked = {
      id: 'reader-revoked',
      name: 'Reader dicabut',
      status: DeviceReaderStatus.REVOKED,
      type: ReaderType.QR_ANDROID,
      deviceId: null
    };
    prisma.deviceReader.findUnique.mockResolvedValue(revoked);
    const service = new DeviceReaderService(prisma, signatures);

    await expect(service.updateStatus(revoked.id, { status: DeviceReaderStatus.ACTIVE }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateReader(revoked.id, { name: 'Jangan hidupkan' }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.rotateApiKey(revoked.id, actor)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.__tx.deviceReader.update).not.toHaveBeenCalled();
    expect(prisma.__tx.deviceReader.updateMany).not.toHaveBeenCalled();
    expect(signatures.generateReaderSecret).not.toHaveBeenCalled();
    expect(signatures.encryptSecret).not.toHaveBeenCalled();
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

  it('preserves target Android reader mode mappings when reactivating', async () => {
    const targets = [
      ['READER_DEV_TEST_01', [AndroidReaderMode.CHECK_ONLY]],
      ['READER_IDENTITY_01', [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]],
      ['READER_GATE_PRAYER_01', [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]],
      ['READER_GATE_PRAYER_02', [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]]
    ];

    for (const [deviceId, allowedModes] of targets) {
      const prisma = makePrisma();
      const before = {
        id: `reader-${deviceId}`,
        deviceId,
        name: deviceId,
        status: DeviceReaderStatus.INACTIVE,
        type: ReaderType.QR_ANDROID,
        platform: DevicePlatform.HARDWARE,
        allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY]
      };
      prisma.deviceReader.findUnique.mockResolvedValue(before);
      prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS - 1);
      prisma.__tx.deviceReader.update.mockResolvedValue({ ...before, status: DeviceReaderStatus.ACTIVE, platform: DevicePlatform.ANDROID, allowedModes });
      const service = new DeviceReaderService(prisma, makeSignatures());

      await service.updateStatus(before.id, { status: DeviceReaderStatus.ACTIVE }, actor);

      expect(prisma.__tx.deviceReader.update).toHaveBeenCalledWith({
        where: { id: before.id },
        data: {
          status: DeviceReaderStatus.ACTIVE,
          platform: DevicePlatform.ANDROID,
          allowedModes
        }
      });
    }
  });

  it('rejects reactivating Android reader when active reader limit is full', async () => {
    const prisma = makePrisma();
    prisma.deviceReader.findUnique.mockResolvedValue({ id: 'reader-inactive', status: DeviceReaderStatus.INACTIVE, type: ReaderType.QR_ANDROID });
    prisma.__tx.deviceReader.count.mockResolvedValue(MAX_ACTIVE_ANDROID_READERS);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.updateStatus('reader-inactive', { status: DeviceReaderStatus.ACTIVE }, actor)).rejects.toMatchObject({ message: ANDROID_READER_LIMIT_MESSAGE });
    expect(prisma.__tx.deviceReader.update).not.toHaveBeenCalled();
  });

  it('records signed Android reader heartbeat without exposing secrets', async () => {
    const prisma = makePrisma();
    const reader = {
      id: 'reader-1',
      name: 'HP Scanner 1',
      type: ReaderType.QR_ANDROID,
      status: DeviceReaderStatus.ACTIVE,
      deviceId: 'android-1',
      allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY],
      readerSecretCiphertext: 'ciphertext-secret',
      apiKeyHash: 'api-key-hash-secret',
      provisioningTokenHash: null
    };
    const signatures = {
      assertValidSignedReaderRequest: jest.fn().mockResolvedValue({ reader, timestamp: new Date(), nonceHash: 'nonce-hash', bodyHash: 'body-hash' })
    } as any;
    const service = new DeviceReaderService(prisma, signatures);
    const payload = {
      pendingQueueCount: 3,
      currentMode: AndroidReaderMode.GERBANG,
      batteryLevel: 72,
      networkStatus: 'WIFI',
      statusMessage: 'Scanner aktif',
      warnings: ['OFFLINE_QUEUE_PENDING'],
      lastQueueFlushAt: '2026-06-20T01:05:00.000Z',
      appVersion: '1.2.3',
      appVersionCode: 7
    };

    const result = await service.recordAndroidStatus(payload, {
      deviceId: 'android-1',
      timestamp: '2026-06-20T01:06:00.000Z',
      nonce: 'nonce-status-1',
      bodyHash: 'body-hash',
      signature: 'signature',
      method: 'POST',
      path: '/api/v1/device-readers/android/status'
    });

    expect(signatures.assertValidSignedReaderRequest).toHaveBeenCalledWith(expect.objectContaining({ expectedType: ReaderType.QR_ANDROID, path: '/api/v1/device-readers/android/status' }));
    expect(prisma.deviceReader.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'reader-1' },
      data: expect.objectContaining({
        pendingQueueCount: 3,
        currentMode: AndroidReaderMode.GERBANG,
        batteryLevel: 72,
        networkStatus: 'WIFI',
        statusWarnings: ['OFFLINE_QUEUE_PENDING'],
        appVersion: '1.2.3',
        appVersionCode: 7
      })
    }));
    expect(result).toMatchObject({ ok: true, item: { pendingQueueCount: 3, currentMode: AndroidReaderMode.GERBANG, hasReaderSecret: false, monitorWarnings: ['OFFLINE_QUEUE_PENDING'] } });
    expect(JSON.stringify(result)).not.toContain('ciphertext-secret');
    expect(JSON.stringify(result)).not.toContain('api-key-hash-secret');
  });

  it('rejects signed heartbeat mode outside the server allowlist without updating monitoring', async () => {
    const prisma = makePrisma();
    const reader = {
      id: 'reader-check-only',
      type: ReaderType.QR_ANDROID,
      status: DeviceReaderStatus.ACTIVE,
      deviceId: 'android-check-only',
      allowedModes: [AndroidReaderMode.CHECK_ONLY]
    };
    const signatures = {
      assertValidSignedReaderRequest: jest.fn().mockResolvedValue({ reader, timestamp: new Date(), nonceHash: 'nonce-hash', bodyHash: 'body-hash' })
    } as any;
    const service = new DeviceReaderService(prisma, signatures);

    await expect(service.recordAndroidStatus({ pendingQueueCount: 0, currentMode: AndroidReaderMode.MUSHOLA }, {
      deviceId: 'android-check-only',
      timestamp: '2026-07-13T08:00:00.000Z',
      nonce: 'nonce-status-disallowed',
      bodyHash: 'body-hash',
      signature: 'signature',
      method: 'POST',
      path: '/api/v1/device-readers/android/status'
    })).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.deviceReader.update).not.toHaveBeenCalled();
  });

  it('upgrades a gate target from legacy GERBANG to explicit directions on heartbeat', async () => {
    const prisma = makePrisma();
    const reader = {
      id: 'reader-gate',
      name: 'READER_GATE_PRAYER_01',
      type: ReaderType.QR_ANDROID,
      status: DeviceReaderStatus.ACTIVE,
      deviceId: 'READER_GATE_PRAYER_01',
      allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA]
    };
    const signatures = {
      assertValidSignedReaderRequest: jest.fn().mockResolvedValue({ reader, timestamp: new Date(), nonceHash: 'nonce-hash', bodyHash: 'body-hash' })
    } as any;
    const service = new DeviceReaderService(prisma, signatures);

    await service.recordAndroidStatus({ pendingQueueCount: 0 }, {
      deviceId: 'READER_GATE_PRAYER_01',
      timestamp: '2026-07-21T08:00:00.000Z',
      nonce: 'nonce-upgrade-mode',
      bodyHash: 'body-hash',
      signature: 'signature',
      method: 'POST',
      path: '/api/v1/device-readers/android/status'
    });

    expect(prisma.deviceReader.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        allowedModes: [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA]
      })
    }));
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

  it('revoke QR_ANDROID clears device identity', async () => {
    const prisma = makePrisma();
    const expiresAt = new Date(Date.now() + 60_000);
    const before = {
      id: 'android-reader-1',
      name: 'HP Scanner 1',
      type: ReaderType.QR_ANDROID,
      platform: DevicePlatform.ANDROID,
      status: DeviceReaderStatus.ACTIVE,
      deviceId: 'physical-hp-1',
      readerSecretCiphertext: 'enc-secret',
      provisioningTokenHash: 'token-hash',
      provisioningExpiresAt: expiresAt,
      lastSeenAt: new Date('2026-06-20T01:00:00.000Z'),
      lastSignedScanAt: new Date('2026-06-20T01:05:00.000Z'),
      allowedModes: [AndroidReaderMode.GERBANG, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY]
    };
    const after = {
      ...before,
      status: DeviceReaderStatus.REVOKED,
      deviceId: null,
      readerSecretCiphertext: null,
      provisioningTokenHash: null,
      provisioningExpiresAt: null,
      lastSignedScanAt: null,
      revokedAt: new Date(),
      revokedById: actor.sub,
      revokedReason: 'HP diganti'
    };
    prisma.deviceReader.findUnique.mockResolvedValue(before);
    prisma.__tx.deviceReader.update.mockResolvedValue(after);
    const service = new DeviceReaderService(prisma, makeSignatures());

    const result = await service.revoke('android-reader-1', { reason: 'HP diganti' }, actor);

    expect(prisma.__tx.deviceReader.update).toHaveBeenCalledWith({
      where: { id: 'android-reader-1' },
      data: expect.objectContaining({
        status: DeviceReaderStatus.REVOKED,
        revokedById: actor.sub,
        revokedReason: 'HP diganti',
        deviceId: null,
        readerSecretCiphertext: null,
        provisioningTokenHash: null,
        provisioningExpiresAt: null,
        lastSignedScanAt: null
      })
    });
    expect(prisma.__tx.deviceReader.update.mock.calls[0][0].data).not.toHaveProperty('lastSeenAt');
    expect(prisma.__tx.deviceReader.update.mock.calls[0][0].data).not.toHaveProperty('allowedModes');
    expect(result).toMatchObject({ status: DeviceReaderStatus.REVOKED, deviceId: null, hasReaderSecret: false, hasProvisioningToken: false });
  });

  it('revoke QR_ANDROID frees deviceId for reprovision', async () => {
    const prisma = makePrisma();
    const token = 'shrp_reprovisionToken_12345';
    const oldRevokedReader = { id: 'old-reader', type: ReaderType.QR_ANDROID, status: DeviceReaderStatus.REVOKED, deviceId: null };
    const pendingReader = { id: 'new-reader', name: 'HP Scanner baru', status: DeviceReaderStatus.INACTIVE, type: ReaderType.QR_ANDROID, allowedModes: [], provisioningTokenHash: readerCredentialDigest(token), provisioningExpiresAt: new Date(Date.now() + 60_000) };
    prisma.deviceReader.findMany.mockResolvedValue([pendingReader]);
    prisma.__tx.deviceReader.count.mockResolvedValue(1);
    prisma.__tx.deviceReader.findUniqueOrThrow.mockResolvedValue({ ...pendingReader, deviceId: 'physical-hp-1', status: DeviceReaderStatus.ACTIVE, provisioningTokenHash: null, readerSecretCiphertext: 'enc-secret' });
    const service = new DeviceReaderService(prisma, makeSignatures());

    await expect(service.completeAndroidProvision({ provisionToken: token, deviceId: oldRevokedReader.deviceId ?? 'physical-hp-1' })).resolves.toMatchObject({ deviceId: 'physical-hp-1', readerId: 'new-reader' });

    expect(prisma.__tx.deviceReader.count).toHaveBeenCalledWith({ where: { type: ReaderType.QR_ANDROID, status: DeviceReaderStatus.ACTIVE, id: { not: 'new-reader' } } });
    expect(prisma.__tx.deviceReader.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deviceId: 'physical-hp-1', status: DeviceReaderStatus.ACTIVE, provisioningTokenHash: null, provisioningExpiresAt: null })
    }));
  });

  it('revoke QR_ANDROID frees active slot', async () => {
    const prisma = makePrisma();
    prisma.__tx.deviceReader.count.mockResolvedValue(0);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await service.startAndroidProvision({ name: 'HP Scanner pengganti' }, actor);

    expect(prisma.__tx.deviceReader.count).toHaveBeenCalledWith({ where: { type: ReaderType.QR_ANDROID, status: DeviceReaderStatus.ACTIVE } });
    expect(prisma.__tx.deviceReader.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: DeviceReaderStatus.INACTIVE, type: ReaderType.QR_ANDROID }) }));
  });

  it('non-QR reader revoke unchanged', async () => {
    const prisma = makePrisma();
    const before = {
      id: 'gate-reader-1',
      name: 'Gerbang 1',
      type: ReaderType.GATE,
      status: DeviceReaderStatus.ACTIVE,
      deviceId: 'gate-device-1',
      readerSecretCiphertext: 'enc-secret',
      provisioningTokenHash: 'unused-token',
      provisioningExpiresAt: new Date(Date.now() + 60_000),
      lastSignedScanAt: new Date('2026-06-20T01:05:00.000Z')
    };
    prisma.deviceReader.findUnique.mockResolvedValue(before);
    prisma.__tx.deviceReader.update.mockResolvedValue({ ...before, status: DeviceReaderStatus.REVOKED, revokedAt: new Date(), revokedById: actor.sub, revokedReason: 'rusak' });
    const service = new DeviceReaderService(prisma, makeSignatures());

    await service.revoke('gate-reader-1', { reason: 'rusak' }, actor);

    expect(prisma.__tx.deviceReader.update).toHaveBeenCalledWith({
      where: { id: 'gate-reader-1' },
      data: expect.objectContaining({ status: DeviceReaderStatus.REVOKED, revokedById: actor.sub, revokedReason: 'rusak' })
    });
    const updateData = prisma.__tx.deviceReader.update.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('deviceId');
    expect(updateData).not.toHaveProperty('readerSecretCiphertext');
    expect(updateData).not.toHaveProperty('provisioningTokenHash');
    expect(updateData).not.toHaveProperty('provisioningExpiresAt');
    expect(updateData).not.toHaveProperty('lastSignedScanAt');
  });

  it('audit redact safety for reader revoke', async () => {
    const prisma = makePrisma();
    const before = {
      id: 'android-reader-1',
      name: 'HP Scanner 1',
      type: ReaderType.QR_ANDROID,
      status: DeviceReaderStatus.ACTIVE,
      deviceId: 'physical-hp-1',
      apiKeyHash: 'api-key-hash-secret',
      keyPrefix: 'shr_abc',
      keyLast4: 'wxyz',
      readerSecretCiphertext: 'ciphertext-secret',
      provisioningTokenHash: 'provisioning-token-secret',
      provisioningExpiresAt: new Date(Date.now() + 60_000),
      lastSignedScanAt: new Date('2026-06-20T01:05:00.000Z')
    };
    const after = {
      ...before,
      status: DeviceReaderStatus.REVOKED,
      deviceId: null,
      readerSecretCiphertext: null,
      provisioningTokenHash: null,
      provisioningExpiresAt: null,
      lastSignedScanAt: null,
      revokedAt: new Date(),
      revokedById: actor.sub,
      revokedReason: 'diganti'
    };
    prisma.deviceReader.findUnique.mockResolvedValue(before);
    prisma.__tx.deviceReader.update.mockResolvedValue(after);
    const service = new DeviceReaderService(prisma, makeSignatures());

    await service.revoke('android-reader-1', { reason: 'diganti' }, actor);

    const auditData = prisma.__tx.auditEntry.create.mock.calls[0][0].data;
    const serializedAudit = JSON.stringify({ before: auditData.before, after: auditData.after, canonicalPayload: auditData.canonicalPayload });
    expect(serializedAudit).not.toContain('apiKeyHash');
    expect(serializedAudit).not.toContain('readerSecretCiphertext');
    expect(serializedAudit).not.toContain('provisioningTokenHash');
    expect(serializedAudit).not.toContain('api-key-hash-secret');
    expect(serializedAudit).not.toContain('ciphertext-secret');
    expect(serializedAudit).not.toContain('provisioning-token-secret');
  });
});
