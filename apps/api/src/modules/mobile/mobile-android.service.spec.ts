import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Role } from '@prisma/client';
import { MobileAndroidService } from './mobile-android.service';

jest.mock('../../common/audit-log', () => ({ writeAudit: jest.fn().mockResolvedValue(undefined) }));

const actor = { sub: 'user-1', role: Role.OPERATOR_IT };

function release(overrides: Record<string, unknown> = {}) {
  const id = String(overrides.id || `apk_${'1'.repeat(32)}`);
  return {
    id,
    versionName: '1.2.0',
    versionCode: 4,
    minSupportedVersionCode: 1,
    forceUpdate: false,
    releaseNotes: 'Update APK',
    apkFileName: 'reader.apk',
    apkPath: `${id}.apk`,
    apkSha256: 'a'.repeat(64),
    apkSizeBytes: 8,
    contentType: 'application/vnd.android.package-archive',
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
    androidApkRelease: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    mobileAndroidReaderVersion: {
      findUnique: jest.fn(),
      upsert: jest.fn()
    }
  };
  const prisma: any = {
    androidApkRelease: {
      findFirst: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    mobileAndroidReaderVersion: {
      upsert: jest.fn(),
      findUnique: jest.fn()
    },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
    __tx: tx
  };
  return prisma;
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
    if (previousStorage === undefined) delete process.env.ANDROID_APK_STORAGE_DIR;
    else process.env.ANDROID_APK_STORAGE_DIR = previousStorage;
    delete process.env.ANDROID_APK_MAX_BYTES;
    await rm(dir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('uses highest published APK as public version metadata', async () => {
    const prisma = prismaMock();
    prisma.androidApkRelease.findFirst.mockResolvedValue(release({ isPublished: true, publishedAt: new Date(), versionCode: 5, apkSizeBytes: 123 }));
    const service = new MobileAndroidService(prisma);

    await expect(service.getAndroidReaderVersion()).resolves.toMatchObject({
      latestVersionCode: 5,
      downloadUrl: `/api/v1/mobile/android-reader/releases/apk_${'1'.repeat(32)}/download`,
      apkSha256: 'a'.repeat(64),
      apkSizeBytes: 123
    });
  });

  it('creates APK release, stores file metadata, and returns no private path', async () => {
    const prisma = prismaMock();
    prisma.__tx.androidApkRelease.create.mockImplementation(async ({ data }: any) => release(data));
    const service = new MobileAndroidService(prisma);

    const created = await service.createApkRelease(
      { versionName: '1.2.0', versionCode: 4, minSupportedVersionCode: 1, forceUpdate: false, releaseNotes: 'Catatan' } as any,
      { buffer: Buffer.from('apkbytes'), originalname: 'reader.apk', mimetype: 'application/vnd.android.package-archive' },
      actor
    );

    expect(prisma.__tx.androidApkRelease.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        versionName: '1.2.0',
        versionCode: 4,
        apkSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        apkSizeBytes: 8,
        contentType: 'application/vnd.android.package-archive'
      })
    }));
    expect(created).toMatchObject({ versionName: '1.2.0', downloadUrl: null });
    expect(JSON.stringify(created)).not.toContain('apkPath');
  });

  it('rejects invalid APK upload inputs', async () => {
    const service = new MobileAndroidService(prismaMock());
    await expect(service.createApkRelease({ versionName: '1.2.0', versionCode: 4, minSupportedVersionCode: 5, forceUpdate: false } as any, { buffer: Buffer.from('apk'), originalname: 'reader.apk', mimetype: 'application/vnd.android.package-archive' }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createApkRelease({ versionName: '1.2.0', versionCode: 4, minSupportedVersionCode: 1, forceUpdate: false } as any, { buffer: Buffer.from('apk'), originalname: 'reader.zip', mimetype: 'application/vnd.android.package-archive' }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps unique version conflicts to ConflictException', async () => {
    const prisma = prismaMock();
    prisma.$transaction.mockRejectedValue({ code: 'P2002', constructor: { name: 'PrismaClientKnownRequestError' } });
    const service = new MobileAndroidService(prisma);
    await expect(service.createApkRelease({ versionName: '1.2.0', versionCode: 4, minSupportedVersionCode: 1, forceUpdate: false } as any, { buffer: Buffer.from('apk'), originalname: 'reader.apk', mimetype: 'application/vnd.android.package-archive' }, actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('publishes only when stored APK exists', async () => {
    const prisma = prismaMock();
    const item = release();
    prisma.androidApkRelease.findUnique.mockResolvedValue(item);
    prisma.__tx.androidApkRelease.update.mockResolvedValue(release({ isPublished: true, publishedAt: new Date() }));
    await writeFile(path.join(dir, `${item.id}.apk`), Buffer.from('apkbytes'));
    const service = new MobileAndroidService(prisma);

    await expect(service.publishApkRelease(item.id, actor)).resolves.toMatchObject({ isPublished: true, downloadUrl: `/api/v1/mobile/android-reader/releases/${item.id}/download` });
  });

  it('returns 404 when downloading unpublished APK', async () => {
    const prisma = prismaMock();
    prisma.androidApkRelease.findUnique.mockResolvedValue(release({ isPublished: false }));
    const service = new MobileAndroidService(prisma);
    await expect(service.downloadApkRelease('apk_1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
