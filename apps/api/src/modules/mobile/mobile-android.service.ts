import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AndroidApkRelease, Prisma, Role } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AndroidApkAttestation, AndroidApkValidationError, AndroidApkValidatorService } from './android-apk-validator.service';
import { CreateAndroidApkReleaseDto, UpdateAndroidApkReleaseDto, UpdateAndroidReaderVersionDto } from './mobile-android.dto';

export interface ApkUploadFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

const APK_CONTENT_TYPE = 'application/vnd.android.package-archive';
const DEFAULT_APK_MAX_BYTES = 150 * 1024 * 1024;
const APK_LIFECYCLE_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 30_000 };
const APK_PUBLISH_VALIDATION_TIMEOUT_MS = 10_000;

function apkStorageDir() {
  return process.env.ANDROID_APK_STORAGE_DIR || path.resolve(process.cwd(), 'uploads/android-apk-releases');
}

function apkMaxBytes() {
  return Number(process.env.ANDROID_APK_MAX_BYTES || DEFAULT_APK_MAX_BYTES);
}

interface ApkFileFingerprint {
  sha256: string;
  sizeBytes: number;
}

function sameFingerprint(left: ApkFileFingerprint, right: ApkFileFingerprint) {
  return left.sha256 === right.sha256 && left.sizeBytes === right.sizeBytes;
}

async function fingerprintApkFile(filePath: string): Promise<ApkFileFingerprint> {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => {
    throw new BadRequestException('File APK tidak dapat diverifikasi.');
  });
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1) throw new BadRequestException('File APK tidak valid.');
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let total = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      total += bytesRead;
    }
    const after = await handle.stat();
    if (!after.isFile() || total !== before.size || after.size !== before.size) {
      throw new BadRequestException('File APK berubah saat diverifikasi.');
    }
    return { sha256: hash.digest('hex'), sizeBytes: total };
  } finally {
    await handle.close();
  }
}

function safeVersionName(value: string) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new BadRequestException('Nama versi APK wajib diisi.');
  if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,39}$/.test(normalized)) throw new BadRequestException('Nama versi APK tidak valid.');
  return normalized;
}

function sanitizeReleaseNotes(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, 4000) : null;
}

function publicDownloadUrl(release: Pick<AndroidApkRelease, 'id'>) {
  return `/api/v1/mobile/android-reader/releases/${encodeURIComponent(release.id)}/download`;
}

function safeFileName(name: string) {
  return path.basename(name).replace(/[^0-9A-Za-z._-]/g, '-').slice(0, 120) || 'schoolhub-reader.apk';
}

function storagePathForKey(storageKey: string) {
  if (!/^apk_[0-9a-f]{32}\.apk$/.test(storageKey)) throw new NotFoundException('Path APK tidak valid.');
  const root = path.resolve(apkStorageDir());
  const filePath = path.resolve(root, storageKey);
  if (path.dirname(filePath) !== root) throw new NotFoundException('Path APK tidak valid.');
  return filePath;
}

@Injectable()
export class MobileAndroidService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apkValidator: AndroidApkValidatorService
  ) {}

  private toPublicRelease(release: AndroidApkRelease) {
    return {
      id: release.id,
      versionName: release.versionName,
      versionCode: release.versionCode,
      minSupportedVersionCode: release.minSupportedVersionCode,
      forceUpdate: release.forceUpdate,
      releaseNotes: release.releaseNotes,
      apkFileName: release.apkFileName,
      apkSha256: release.apkSha256,
      apkSizeBytes: release.apkSizeBytes,
      contentType: release.contentType,
      targetSdkVersion: release.targetSdkVersion,
      verificationStatus: release.verificationStatus,
      verifiedAt: release.verifiedAt,
      isPublished: release.isPublished,
      publishedAt: release.publishedAt,
      createdAt: release.createdAt,
      updatedAt: release.updatedAt,
      downloadUrl: release.isPublished ? publicDownloadUrl(release) : null
    };
  }

  async getAndroidReaderVersion() {
    const latestRelease = await this.prisma.androidApkRelease.findFirst({
      where: { isPublished: true },
      orderBy: { versionCode: 'desc' }
    });
    if (latestRelease) {
      return {
        latestVersionName: latestRelease.versionName,
        latestVersionCode: latestRelease.versionCode,
        minSupportedVersionCode: latestRelease.minSupportedVersionCode,
        downloadUrl: publicDownloadUrl(latestRelease),
        apkSha256: latestRelease.apkSha256,
        apkSizeBytes: latestRelease.apkSizeBytes,
        releaseNotes: latestRelease.releaseNotes,
        forceUpdate: latestRelease.forceUpdate
      };
    }

    const version = await this.prisma.mobileAndroidReaderVersion.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, latestVersionName: '1.0.0', latestVersionCode: 1, minSupportedVersionCode: 1, releaseNotes: 'Baseline APK Android official QR reader.', forceUpdate: false }
    });
    return {
      latestVersionName: version.latestVersionName,
      latestVersionCode: version.latestVersionCode,
      minSupportedVersionCode: version.minSupportedVersionCode,
      downloadUrl: version.downloadUrl,
      releaseNotes: version.releaseNotes,
      forceUpdate: version.forceUpdate
    };
  }

  async updateAndroidReaderVersion(payload: UpdateAndroidReaderVersionDto, actor: { sub: string; role: Role }) {
    if (payload.minSupportedVersionCode > payload.latestVersionCode) throw new BadRequestException('Minimum supported version tidak boleh lebih tinggi dari latest version.');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.mobileAndroidReaderVersion.findUnique({ where: { id: 1 } });
      const updated = await tx.mobileAndroidReaderVersion.upsert({
        where: { id: 1 },
        update: { ...payload, updatedById: actor.sub },
        create: { id: 1, ...payload, updatedById: actor.sub }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'mobile',
        action: 'mobile.android_reader.version.updated',
        resource: 'mobileAndroidReaderVersion',
        resourceId: '1',
        before: before as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue
      });
      return updated;
    });
  }

  async listApkReleases(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.androidApkRelease.count(),
      this.prisma.androidApkRelease.findMany({ orderBy: [{ versionCode: 'desc' }, { createdAt: 'desc' }], skip: pagination.skip, take: pagination.limit })
    ]);
    return { items: items.map((item) => this.toPublicRelease(item)), meta: buildPaginationMeta(total, pagination) };
  }

  async createApkRelease(payload: CreateAndroidApkReleaseDto, file: ApkUploadFile | undefined, actor: { sub: string; role: Role }) {
    if (!file?.buffer?.length) throw new BadRequestException('File APK wajib diunggah pada field apk.');
    const originalName = safeFileName(file.originalname || 'schoolhub-reader.apk');
    if (!originalName.toLowerCase().endsWith('.apk')) throw new BadRequestException('File harus berekstensi .apk.');
    const contentType = String(file.mimetype || APK_CONTENT_TYPE).toLowerCase();
    if (contentType && contentType !== APK_CONTENT_TYPE && contentType !== 'application/octet-stream') throw new BadRequestException('Content-Type APK tidak valid.');
    if (file.buffer.byteLength > apkMaxBytes()) throw new BadRequestException(`Ukuran APK terlalu besar. Maksimal ${Math.floor(apkMaxBytes() / 1024 / 1024)}MB.`);
    const versionName = safeVersionName(payload.versionName);
    if (payload.minSupportedVersionCode > payload.versionCode) throw new BadRequestException('Minimum supported version tidak boleh lebih tinggi dari versionCode.');

    const id = `apk_${randomUUID().replace(/-/g, '')}`;
    const storageKey = `${id}.apk`;
    const storageRoot = path.resolve(apkStorageDir());
    const finalPath = storagePathForKey(storageKey);
    const temporaryPath = path.join(storageRoot, `.upload-${randomUUID()}.apk`);
    let finalStored = false;

    await mkdir(storageRoot, { recursive: true, mode: 0o700 });
    try {
      await writeFile(temporaryPath, file.buffer, { flag: 'wx', mode: 0o600 });
      await chmod(temporaryPath, 0o600);
      const beforeValidation = await fingerprintApkFile(temporaryPath);
      const attestation = await this.verifyApkFile(temporaryPath, { versionName, versionCode: payload.versionCode });
      const afterValidation = await fingerprintApkFile(temporaryPath);
      if (!sameFingerprint(beforeValidation, afterValidation)) throw new BadRequestException('File APK berubah saat diverifikasi.');

      await rename(temporaryPath, finalPath);
      finalStored = true;
      // Local volume access cannot prevent a privileged host actor from replacing a path after this check.
      // Publish repeats verification immediately before its locked database transition.
      const finalFingerprint = await fingerprintApkFile(finalPath);
      if (!sameFingerprint(afterValidation, finalFingerprint)) throw new BadRequestException('File APK berubah saat disimpan.');

      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.androidApkRelease.create({
          data: {
            id,
            versionName,
            versionCode: payload.versionCode,
            minSupportedVersionCode: payload.minSupportedVersionCode,
            forceUpdate: payload.forceUpdate,
            releaseNotes: sanitizeReleaseNotes(payload.releaseNotes),
            apkFileName: originalName,
            apkPath: storageKey,
            apkSha256: finalFingerprint.sha256,
            apkSizeBytes: finalFingerprint.sizeBytes,
            contentType: APK_CONTENT_TYPE,
            ...attestation,
            createdById: actor.sub,
            updatedById: actor.sub
          }
        });
        await writeAudit(tx, {
          actorId: actor.sub,
          actorRole: actor.role,
          module: 'mobile',
          action: 'mobile.android_apk.release.created',
          resource: 'androidApkRelease',
          resourceId: created.id,
          after: this.sanitizedAttestationAudit(created) as Prisma.InputJsonValue
        });
        return this.toPublicRelease(created);
      });
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      if (finalStored) await unlink(finalPath).catch(() => undefined);
      if (error instanceof AndroidApkValidationError) {
        await this.auditRejectedAttestation(id, versionName, payload.versionCode, actor, error.reasonCode);
      }
      if ((error as { code?: string })?.code === 'P2002') throw new ConflictException('Version code APK sudah terdaftar.');
      throw error;
    }
  }

  async updateApkRelease(id: string, payload: UpdateAndroidApkReleaseDto, actor: { sub: string; role: Role }) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await this.lockAndReadApkRelease(tx, id);
      const minSupportedVersionCode = payload.minSupportedVersionCode ?? before.minSupportedVersionCode;
      if (minSupportedVersionCode > before.versionCode) throw new BadRequestException('Minimum supported version tidak boleh lebih tinggi dari versionCode.');
      const item = await tx.androidApkRelease.update({
        where: { id },
        data: {
          minSupportedVersionCode,
          forceUpdate: payload.forceUpdate ?? before.forceUpdate,
          releaseNotes: payload.releaseNotes !== undefined ? sanitizeReleaseNotes(payload.releaseNotes) : undefined,
          updatedById: actor.sub
        }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'mobile',
        action: 'mobile.android_apk.release.updated',
        resource: 'androidApkRelease',
        resourceId: id,
        before: this.toPublicRelease(before) as Prisma.InputJsonValue,
        after: this.toPublicRelease(item) as Prisma.InputJsonValue
      });
      return item;
    }, APK_LIFECYCLE_TRANSACTION_OPTIONS);
    return this.toPublicRelease(updated);
  }

  async publishApkRelease(id: string, actor: { sub: string; role: Role }) {
    // Reject bad or absent files before holding a database row lock. The locked phase
    // repeats every check against current metadata so this preflight is never trusted.
    const preliminary = await this.prisma.androidApkRelease.findUnique({ where: { id } });
    if (!preliminary) throw new NotFoundException('Release APK tidak ditemukan.');
    this.assertApkReleaseMetadata(preliminary);
    const preliminaryPath = await this.releaseFilePath(preliminary);
    const preliminaryFingerprint = await fingerprintApkFile(preliminaryPath);
    this.assertFingerprintMatchesRelease(preliminaryFingerprint, preliminary);
    await this.verifyApkFileWithin(preliminaryPath, { versionName: preliminary.versionName, versionCode: preliminary.versionCode });

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockAndReadApkRelease(tx, id);
      this.assertApkReleaseMetadata(locked);

      const filePath = await this.releaseFilePath(locked);
      const beforeValidation = await fingerprintApkFile(filePath);
      this.assertFingerprintMatchesRelease(beforeValidation, locked);
      if (!sameFingerprint(preliminaryFingerprint, beforeValidation)) {
        throw new BadRequestException('File APK berubah sebelum dipublikasikan.');
      }
      const attestation = await this.verifyApkFileWithin(filePath, { versionName: locked.versionName, versionCode: locked.versionCode });
      const afterValidation = await fingerprintApkFile(filePath);
      if (!sameFingerprint(beforeValidation, afterValidation)) throw new BadRequestException('File APK berubah saat diverifikasi.');

      // A privileged host actor can still replace a volume path after this final fingerprint.
      // Filesystem ownership plus the locked metadata transaction minimize that operational TOCTOU window.
      const item = await tx.androidApkRelease.update({
        where: { id },
        data: {
          ...attestation,
          apkSha256: afterValidation.sha256,
          apkSizeBytes: afterValidation.sizeBytes,
          isPublished: true,
          publishedAt: new Date(),
          updatedById: actor.sub
        }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'mobile',
        action: 'mobile.android_apk.release.published',
        resource: 'androidApkRelease',
        resourceId: id,
        after: this.sanitizedAttestationAudit(item) as Prisma.InputJsonValue
      });
      return item;
    }, APK_LIFECYCLE_TRANSACTION_OPTIONS);
    return this.toPublicRelease(updated);
  }

  async unpublishApkRelease(id: string, actor: { sub: string; role: Role }) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await this.lockAndReadApkRelease(tx, id);
      const item = await tx.androidApkRelease.update({ where: { id }, data: { isPublished: false, publishedAt: null, updatedById: actor.sub } });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'mobile',
        action: 'mobile.android_apk.release.unpublished',
        resource: 'androidApkRelease',
        resourceId: id,
        before: this.toPublicRelease(before) as Prisma.InputJsonValue,
        after: { id, versionCode: item.versionCode }
      });
      return item;
    }, APK_LIFECYCLE_TRANSACTION_OPTIONS);
    return this.toPublicRelease(updated);
  }

  async deleteApkRelease(id: string, actor: { sub: string; role: Role }) {
    let deletedRelease: AndroidApkRelease | null = null;
    await this.prisma.$transaction(async (tx) => {
      const before = await this.lockAndReadApkRelease(tx, id);
      if (before.isPublished) throw new ForbiddenException('Release APK published harus unpublish dulu sebelum dihapus.');
      await tx.androidApkRelease.delete({ where: { id } });
      deletedRelease = before;
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'mobile',
        action: 'mobile.android_apk.release.deleted',
        resource: 'androidApkRelease',
        resourceId: id,
        before: this.toPublicRelease(before) as Prisma.InputJsonValue
      });
    }, APK_LIFECYCLE_TRANSACTION_OPTIONS);
    const filePath = deletedRelease ? await this.releaseFilePath(deletedRelease).catch(() => null) : null;
    if (filePath) await unlink(filePath).catch(() => undefined);
    return { ok: true };
  }

  async downloadApkRelease(id: string) {
    const release = await this.prisma.androidApkRelease.findUnique({ where: { id } });
    if (!release || !release.isPublished) throw new NotFoundException('APK release tidak ditemukan.');
    const filePath = await this.releaseFilePath(release);
    return { release: this.toPublicRelease(release), fileName: release.apkFileName, stream: new StreamableFile(createReadStream(filePath), { type: APK_CONTENT_TYPE }) };
  }

  async downloadLatestApk() {
    const latest = await this.prisma.androidApkRelease.findFirst({ where: { isPublished: true }, orderBy: { versionCode: 'desc' } });
    if (!latest) throw new NotFoundException('APK published belum tersedia.');
    return this.downloadApkRelease(latest.id);
  }

  private async auditRejectedAttestation(id: string, versionName: string, versionCode: number, actor: { sub: string; role: Role }, reasonCode: string) {
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'mobile',
        action: 'mobile.android_apk.release.rejected',
        resource: 'androidApkRelease',
        resourceId: id,
        after: { id, versionName, versionCode, verificationStatus: 'REJECTED', reasonCode } as Prisma.InputJsonValue
      });
    }).catch(() => undefined);
  }

  private async lockAndReadApkRelease(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AndroidApkRelease" WHERE "id" = ${id} FOR UPDATE`);
    const release = await tx.androidApkRelease.findUnique({ where: { id } });
    if (!release) throw new NotFoundException('Release APK tidak ditemukan.');
    return release;
  }

  private assertApkReleaseMetadata(release: Pick<AndroidApkRelease, 'apkSha256' | 'apkSizeBytes' | 'contentType'>) {
    if (!/^[a-f0-9]{64}$/.test(release.apkSha256) || release.apkSizeBytes <= 0 || release.contentType !== APK_CONTENT_TYPE) {
      throw new BadRequestException('Metadata APK belum valid.');
    }
  }

  private assertFingerprintMatchesRelease(fingerprint: ApkFileFingerprint, release: Pick<AndroidApkRelease, 'apkSha256' | 'apkSizeBytes'>) {
    if (fingerprint.sha256 !== release.apkSha256 || fingerprint.sizeBytes !== release.apkSizeBytes) {
      throw new BadRequestException('File APK tidak cocok dengan metadata release.');
    }
  }

  private async verifyApkFileWithin(filePath: string, expected: { versionName: string; versionCode: number }): Promise<AndroidApkAttestation> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.verifyApkFile(filePath, expected),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new BadRequestException('Verifikasi APK melewati batas waktu.')), APK_PUBLISH_VALIDATION_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async verifyApkFile(filePath: string, expected: { versionName: string; versionCode: number }): Promise<AndroidApkAttestation> {
    try {
      return await this.apkValidator.verify(filePath, expected);
    } catch (error) {
      if (error instanceof AndroidApkValidationError) throw error;
      throw new BadRequestException('APK tidak lolos verifikasi keamanan.');
    }
  }

  private sanitizedAttestationAudit(release: Pick<AndroidApkRelease, 'id' | 'versionName' | 'versionCode' | 'apkSha256' | 'apkSizeBytes' | 'verificationStatus' | 'verifiedAt' | 'packageName' | 'apkVersionName' | 'apkVersionCode' | 'targetSdkVersion' | 'isDebuggable' | 'usesCleartextTraffic' | 'signatureSchemeV2'>) {
    return {
      id: release.id,
      versionName: release.versionName,
      versionCode: release.versionCode,
      apkSha256: release.apkSha256,
      apkSizeBytes: release.apkSizeBytes,
      verificationStatus: release.verificationStatus,
      verifiedAt: release.verifiedAt,
      packageName: release.packageName,
      apkVersionName: release.apkVersionName,
      apkVersionCode: release.apkVersionCode,
      targetSdkVersion: release.targetSdkVersion,
      isDebuggable: release.isDebuggable,
      usesCleartextTraffic: release.usesCleartextTraffic,
      signatureSchemeV2: release.signatureSchemeV2
    };
  }

  private async releaseFilePath(release: Pick<AndroidApkRelease, 'apkPath'>) {
    const filePath = storagePathForKey(release.apkPath);
    const info = await lstat(filePath).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink()) throw new NotFoundException('File APK tidak ditemukan.');
    return filePath;
  }
}
