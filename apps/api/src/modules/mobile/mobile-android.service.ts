import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AndroidApkRelease, Prisma, Role } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAndroidApkReleaseDto, UpdateAndroidApkReleaseDto, UpdateAndroidReaderVersionDto } from './mobile-android.dto';

export interface ApkUploadFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

const APK_CONTENT_TYPE = 'application/vnd.android.package-archive';
const DEFAULT_APK_MAX_BYTES = 150 * 1024 * 1024;

function apkStorageDir() {
  return process.env.ANDROID_APK_STORAGE_DIR || path.resolve(process.cwd(), 'uploads/android-apk-releases');
}

function apkMaxBytes() {
  return Number(process.env.ANDROID_APK_MAX_BYTES || DEFAULT_APK_MAX_BYTES);
}

function sha256Hex(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
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
  constructor(private readonly prisma: PrismaService) {}

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
    const storageRoot = apkStorageDir();
    const storageFilePath = storagePathForKey(storageKey);
    await mkdir(storageRoot, { recursive: true });
    await writeFile(storageFilePath, file.buffer, { flag: 'wx' });
    const digest = sha256Hex(file.buffer);

    try {
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
            apkSha256: digest,
            apkSizeBytes: file.buffer.byteLength,
            contentType: APK_CONTENT_TYPE,
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
          after: { id: created.id, versionName: created.versionName, versionCode: created.versionCode, apkSha256: created.apkSha256, apkSizeBytes: created.apkSizeBytes } as Prisma.InputJsonValue
        });
        return this.toPublicRelease(created);
      });
    } catch (error) {
      await unlink(storageFilePath).catch(() => undefined);
      if ((error as { code?: string })?.code === 'P2002') throw new ConflictException('Version code APK sudah terdaftar.');
      throw error;
    }
  }

  async updateApkRelease(id: string, payload: UpdateAndroidApkReleaseDto, actor: { sub: string; role: Role }) {
    const before = await this.prisma.androidApkRelease.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Release APK tidak ditemukan.');
    const minSupportedVersionCode = payload.minSupportedVersionCode ?? before.minSupportedVersionCode;
    if (minSupportedVersionCode > before.versionCode) throw new BadRequestException('Minimum supported version tidak boleh lebih tinggi dari versionCode.');
    const updated = await this.prisma.$transaction(async (tx) => {
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
    });
    return this.toPublicRelease(updated);
  }

  async publishApkRelease(id: string, actor: { sub: string; role: Role }) {
    const before = await this.prisma.androidApkRelease.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Release APK tidak ditemukan.');
    if (!/^[a-f0-9]{64}$/.test(before.apkSha256) || before.apkSizeBytes <= 0 || before.contentType !== APK_CONTENT_TYPE) throw new BadRequestException('Metadata APK belum valid.');
    await this.releaseFilePath(before);
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.androidApkRelease.update({ where: { id }, data: { isPublished: true, publishedAt: new Date(), updatedById: actor.sub } });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role, module: 'mobile', action: 'mobile.android_apk.release.published', resource: 'androidApkRelease', resourceId: id, after: { id, versionCode: item.versionCode } });
      return item;
    });
    return this.toPublicRelease(updated);
  }

  async unpublishApkRelease(id: string, actor: { sub: string; role: Role }) {
    const before = await this.prisma.androidApkRelease.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Release APK tidak ditemukan.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.androidApkRelease.update({ where: { id }, data: { isPublished: false, publishedAt: null, updatedById: actor.sub } });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role, module: 'mobile', action: 'mobile.android_apk.release.unpublished', resource: 'androidApkRelease', resourceId: id, after: { id, versionCode: item.versionCode } });
      return item;
    });
    return this.toPublicRelease(updated);
  }

  async deleteApkRelease(id: string, actor: { sub: string; role: Role }) {
    const before = await this.prisma.androidApkRelease.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Release APK tidak ditemukan.');
    if (before.isPublished) throw new ForbiddenException('Release APK published harus unpublish dulu sebelum dihapus.');
    const filePath = await this.releaseFilePath(before).catch(() => null);
    await this.prisma.$transaction(async (tx) => {
      await tx.androidApkRelease.delete({ where: { id } });
      await writeAudit(tx, { actorId: actor.sub, actorRole: actor.role, module: 'mobile', action: 'mobile.android_apk.release.deleted', resource: 'androidApkRelease', resourceId: id, before: this.toPublicRelease(before) as Prisma.InputJsonValue });
    });
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

  private async releaseFilePath(release: Pick<AndroidApkRelease, 'apkPath'>) {
    const filePath = storagePathForKey(release.apkPath);
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException('File APK tidak ditemukan.');
    return filePath;
  }
}
