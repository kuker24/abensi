import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Role } from '@prisma/client';
import { AndroidApkValidationError } from './android-apk-validator.service';
import { MobileAndroidService } from './mobile-android.service';

jest.mock('../../common/audit-log', () => ({ writeAudit: jest.fn().mockResolvedValue(undefined) }));

const actor = { sub: 'user-1', role: Role.OPERATOR_IT };

function hash(content: Buffer) {
  return createHash('sha256').update(content).digest('hex');
}

function verifiedAttestation(overrides: Record<string, unknown> = {}) {
  return {
    packageName: 'id.sch.man1rokanhulu.absensi',
    apkVersionName: '1.2.0',
    apkVersionCode: 4,
    targetSdkVersion: 35,
    isDebuggable: false,
    usesCleartextTraffic: false,
    signatureSchemeV2: true,
    signerSha256: 'b'.repeat(64),
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date('2026-07-14T00:00:00Z'),
    ...overrides
  } as any;
}

function release(overrides: Record<string, unknown> = {}) {
  const id = String(overrides.id || `apk_${'1'.repeat(32)}`);
  const file = Buffer.from('apkbytes');
  return {
    id,
    versionName: '1.2.0',
    versionCode: 4,
    minSupportedVersionCode: 1,
    forceUpdate: false,
    releaseNotes: 'Update APK',
    apkFileName: 'reader.apk',
    apkPath: `${id}.apk`,
    apkSha256: hash(file),
    apkSizeBytes: file.byteLength,
    contentType: 'application/vnd.android.package-archive',
    packageName: null,
    apkVersionName: null,
    apkVersionCode: null,
    targetSdkVersion: null,
    isDebuggable: null,
    usesCleartextTraffic: null,
    signatureSchemeV2: null,
    signerSha256: null,
    verificationStatus: 'UNVERIFIED',
    verifiedAt: null,
    isPublished: false,
    publishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdById: 'user-1',
    updatedById: 'user-1',
    ...overrides
  } as any;
}

function prismaMock() {
  const tx: any = {
    $queryRaw: jest.fn(),
    androidApkRelease: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn()
    },
    mobileAndroidReaderVersion: {
      findUnique: jest.fn(),
      upsert: jest.fn()
    }
  };
  return {
    androidApkRelease: {
      findFirst: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    mobileAndroidReaderVersion: {
      upsert: jest.fn(),
      findUnique: jest.fn()
    },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
    __tx: tx
  } as any;
}

function validatorMock() {
  return { verify: jest.fn().mockResolvedValue(verifiedAttestation()) } as any;
}

describe('MobileAndroidService APK update center', () => {
  let dir: string;
  let previousStorage: string | undefined;

  beforeEach(async () => {
    previousStorage = process.env.ANDROID_APK_STORAGE_DIR;
    dir = await mkdtemp(path.join(os.tmpdir(), 'apk-release-test-'));
    process.env.ANDROID_APK_STORAGE_DIR = dir;
    process.env.ANDROID_APK_MAX_BYTES = String(5 * 1024 * 1024);
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (previousStorage === undefined) delete process.env.ANDROID_APK_STORAGE_DIR;
    else process.env.ANDROID_APK_STORAGE_DIR = previousStorage;
    delete process.env.ANDROID_APK_MAX_BYTES;
    await rm(dir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('keeps existing published unverified release downloadable through public metadata', async () => {
    const prisma = prismaMock();
    prisma.androidApkRelease.findFirst.mockResolvedValue(release({ isPublished: true, publishedAt: new Date(), versionCode: 5, apkSizeBytes: 123 }));
    const service = new MobileAndroidService(prisma, validatorMock());

    await expect(service.getAndroidReaderVersion()).resolves.toMatchObject({
      latestVersionCode: 5,
      downloadUrl: `/api/v1/mobile/android-reader/releases/apk_${'1'.repeat(32)}/download`,
      apkSha256: hash(Buffer.from('apkbytes')),
      apkSizeBytes: 123
    });
  });

  it('writes, attests, hashes file bytes, stores attestation, and returns no private path', async () => {
    const prisma = prismaMock();
    const validator = validatorMock();
    prisma.__tx.androidApkRelease.create.mockImplementation(async ({ data }: any) => release({ ...data }));
    const service = new MobileAndroidService(prisma, validator);

    const created = await service.createApkRelease(
      { versionName: '1.2.0', versionCode: 4, minSupportedVersionCode: 1, forceUpdate: false, releaseNotes: 'Catatan' } as any,
      { buffer: Buffer.from('apkbytes'), originalname: 'reader.apk', mimetype: 'application/vnd.android.package-archive' },
      actor
    );

    expect(validator.verify).toHaveBeenCalledWith(expect.stringMatching(/\.upload-[0-9a-f-]+\.apk$/), { versionName: '1.2.0', versionCode: 4 });
    expect(prisma.__tx.androidApkRelease.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        versionName: '1.2.0',
        versionCode: 4,
        apkSha256: hash(Buffer.from('apkbytes')),
        apkSizeBytes: 8,
        verificationStatus: 'VERIFIED',
        packageName: 'id.sch.man1rokanhulu.absensi',
        targetSdkVersion: 35
      })
    }));
    expect(created).toMatchObject({ versionName: '1.2.0', verificationStatus: 'VERIFIED', downloadUrl: null });
    expect(JSON.stringify(created)).not.toMatch(/apkPath|signerSha256/i);
    expect((await readdir(dir)).filter((item) => item.startsWith('.upload-'))).toEqual([]);
  });

  it('rejects invalid APK upload inputs before writing storage', async () => {
    const service = new MobileAndroidService(prismaMock(), validatorMock());
    await expect(service.createApkRelease({ versionName: '1.2.0', versionCode: 4, minSupportedVersionCode: 5, forceUpdate: false } as any, { buffer: Buffer.from('apk'), originalname: 'reader.apk', mimetype: 'application/vnd.android.package-archive' }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createApkRelease({ versionName: '1.2.0', versionCode: 4, minSupportedVersionCode: 1, forceUpdate: false } as any, { buffer: Buffer.from('apk'), originalname: 'reader.zip', mimetype: 'application/vnd.android.package-archive' }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes temporary file and does not create DB row after attestation rejection', async () => {
    const prisma = prismaMock();
    const validator = validatorMock();
    validator.verify.mockRejectedValue(new AndroidApkValidationError('ANDROID_APK_DEBUGGABLE'));
    const service = new MobileAndroidService(prisma, validator);

    await expect(service.createApkRelease({ versionName: '1.2.0', versionCode: 4, minSupportedVersionCode: 1, forceUpdate: false } as any, { buffer: Buffer.from('apkbytes'), originalname: 'reader.apk', mimetype: 'application/vnd.android.package-archive' }, actor)).rejects.toMatchObject({ reasonCode: 'ANDROID_APK_DEBUGGABLE' });
    expect(prisma.__tx.androidApkRelease.create).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  it('maps unique version conflicts to ConflictException and removes stored file', async () => {
    const prisma = prismaMock();
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    const service = new MobileAndroidService(prisma, validatorMock());
    await expect(service.createApkRelease({ versionName: '1.2.0', versionCode: 4, minSupportedVersionCode: 1, forceUpdate: false } as any, { buffer: Buffer.from('apkbytes'), originalname: 'reader.apk', mimetype: 'application/vnd.android.package-archive' }, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(await readdir(dir)).toEqual([]);
  });

  it('locks release, re-verifies matching bytes, and stores fresh attestation before publishing', async () => {
    const prisma = prismaMock();
    const validator = validatorMock();
    const item = release();
    prisma.androidApkRelease.findUnique.mockResolvedValue(item);
    prisma.__tx.androidApkRelease.findUnique.mockResolvedValue(item);
    prisma.__tx.androidApkRelease.update.mockImplementation(async ({ data }: any) => release({ ...item, ...data }));
    await writeFile(path.join(dir, `${item.id}.apk`), Buffer.from('apkbytes'));
    const service = new MobileAndroidService(prisma, validator);

    await expect(service.publishApkRelease(item.id, actor)).resolves.toMatchObject({ isPublished: true, verificationStatus: 'VERIFIED', downloadUrl: `/api/v1/mobile/android-reader/releases/${item.id}/download` });
    expect(prisma.__tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ maxWait: 5_000, timeout: expect.any(Number) }));
    expect((prisma.$transaction.mock.calls.at(-1)?.[1] as { timeout: number }).timeout).toBeGreaterThanOrEqual(30_000);
    expect(validator.verify).toHaveBeenCalledWith(path.join(dir, `${item.id}.apk`), { versionName: '1.2.0', versionCode: 4 });
    expect(prisma.__tx.androidApkRelease.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ apkSha256: hash(Buffer.from('apkbytes')), apkSizeBytes: 8, isPublished: true, verificationStatus: 'VERIFIED' }) }));
  });

  it('rejects publish when locked storage bytes no longer match release metadata', async () => {
    const prisma = prismaMock();
    const item = release({ apkSha256: 'a'.repeat(64) });
    prisma.androidApkRelease.findUnique.mockResolvedValue(item);
    prisma.__tx.androidApkRelease.findUnique.mockResolvedValue(item);
    await writeFile(path.join(dir, `${item.id}.apk`), Buffer.from('apkbytes'));
    const service = new MobileAndroidService(prisma, validatorMock());

    await expect(service.publishApkRelease(item.id, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects publish when locked metadata changes after preliminary verification', async () => {
    const prisma = prismaMock();
    const item = release();
    prisma.androidApkRelease.findUnique.mockResolvedValue(item);
    prisma.__tx.androidApkRelease.findUnique.mockResolvedValue(release({ ...item, apkSha256: 'a'.repeat(64) }));
    await writeFile(path.join(dir, `${item.id}.apk`), Buffer.from('apkbytes'));
    const service = new MobileAndroidService(prisma, validatorMock());

    await expect(service.publishApkRelease(item.id, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.__tx.androidApkRelease.update).not.toHaveBeenCalled();
    expect(prisma.__tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects publish when fresh validator rejects after lock', async () => {
    const prisma = prismaMock();
    const item = release();
    prisma.androidApkRelease.findUnique.mockResolvedValue(item);
    prisma.__tx.androidApkRelease.findUnique.mockResolvedValue(item);
    await writeFile(path.join(dir, `${item.id}.apk`), Buffer.from('apkbytes'));
    const validator = validatorMock();
    validator.verify.mockRejectedValue(new AndroidApkValidationError('ANDROID_APK_SIGNER_NOT_ALLOWED'));
    const service = new MobileAndroidService(prisma, validator);

    await expect(service.publishApkRelease(item.id, actor)).rejects.toMatchObject({ reasonCode: 'ANDROID_APK_SIGNER_NOT_ALLOWED' });
    expect(prisma.__tx.androidApkRelease.update).not.toHaveBeenCalled();
  });

  it('bounds slow APK validation to publish tool budget', async () => {
    jest.useFakeTimers();
    const validator = validatorMock();
    validator.verify.mockImplementation(() => new Promise(() => undefined));
    const service = new MobileAndroidService(prismaMock(), validator);

    const validation = (service as any).verifyApkFileWithin('/tmp/reader.apk', { versionName: '1.2.0', versionCode: 4 });
    const asserted = expect(validation).rejects.toBeInstanceOf(BadRequestException);
    await jest.advanceTimersByTimeAsync(10_000);
    await asserted;
  });

  it('locks and rereads current release for update and unpublish', async () => {
    const prisma = prismaMock();
    const item = release({ forceUpdate: false, isPublished: true, publishedAt: new Date() });
    prisma.__tx.androidApkRelease.findUnique.mockResolvedValue(item);
    prisma.__tx.androidApkRelease.update.mockImplementation(async ({ data }: any) => release({ ...item, ...data }));
    const service = new MobileAndroidService(prisma, validatorMock());

    await expect(service.updateApkRelease(item.id, { forceUpdate: true } as any, actor)).resolves.toMatchObject({ forceUpdate: true });
    await expect(service.unpublishApkRelease(item.id, actor)).resolves.toMatchObject({ isPublished: false, publishedAt: null });

    expect(prisma.__tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.__tx.androidApkRelease.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction.mock.calls.slice(-2)).toEqual(expect.arrayContaining([
      [expect.any(Function), expect.objectContaining({ maxWait: 5_000, timeout: 30_000 })]
    ]));
  });

  it('locks current state before delete and never removes file when locked reread is published', async () => {
    const prisma = prismaMock();
    const stale = release({ isPublished: false });
    const locked = release({ isPublished: true, publishedAt: new Date() });
    prisma.__tx.androidApkRelease.findUnique.mockResolvedValue(locked);
    await writeFile(path.join(dir, `${stale.id}.apk`), Buffer.from('apkbytes'));
    const service = new MobileAndroidService(prisma, validatorMock());

    await expect(service.deleteApkRelease(stale.id, actor)).rejects.toMatchObject({ status: 403 });
    expect(prisma.__tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.androidApkRelease.delete).not.toHaveBeenCalled();
    await expect(readdir(dir)).resolves.toContain(`${stale.id}.apk`);
  });

  it('deletes file only after locked database delete commits', async () => {
    const prisma = prismaMock();
    const item = release();
    prisma.__tx.androidApkRelease.findUnique.mockResolvedValue(item);
    prisma.__tx.androidApkRelease.delete.mockResolvedValue(item);
    await writeFile(path.join(dir, `${item.id}.apk`), Buffer.from('apkbytes'));
    const service = new MobileAndroidService(prisma, validatorMock());

    await expect(service.deleteApkRelease(item.id, actor)).resolves.toEqual({ ok: true });
    expect(prisma.__tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.androidApkRelease.delete).toHaveBeenCalledWith({ where: { id: item.id } });
    await expect(readdir(dir)).resolves.not.toContain(`${item.id}.apk`);
  });

  it('returns 404 when downloading unpublished APK', async () => {
    const prisma = prismaMock();
    prisma.androidApkRelease.findUnique.mockResolvedValue(release({ isPublished: false }));
    const service = new MobileAndroidService(prisma, validatorMock());
    await expect(service.downloadApkRelease('apk_1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
