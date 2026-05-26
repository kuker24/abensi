import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { AndroidReaderMode, DevicePlatform, DeviceReaderStatus, Prisma, ReaderType, Role } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceSignatureService } from '../security/device-signature.service';
import { StepUpAuthService } from '../security/step-up-auth.service';
import { AndroidProvisionCompleteDto, AndroidProvisionStartDto, CreateReaderDto, RevokeReaderDto, RotateReaderKeyDto, UpdateReaderDto, UpdateReaderStatusDto } from './device-reader.dto';

function generateApiKey() {
  return `shr_${randomBytes(16).toString('hex')}`;
}

function generateProvisionToken() {
  return `shrp_${randomBytes(24).toString('base64url')}`;
}

function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

function defaultModes(type?: ReaderType) {
  if (type === ReaderType.GATE) return [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT];
  if (type === ReaderType.MUSHOLA) return [AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY];
  if (type === ReaderType.QR_ANDROID) return [AndroidReaderMode.GATE_IN, AndroidReaderMode.GATE_OUT, AndroidReaderMode.MUSHOLA, AndroidReaderMode.CHECK_ONLY];
  return [];
}

interface Actor {
  sub: string;
  role: Role;
}

@Injectable()
export class DeviceReaderService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly signatures?: DeviceSignatureService,
    @Optional() private readonly stepUp?: StepUpAuthService
  ) {}

  private redact<T extends { apiKey?: string | null; readerSecretCiphertext?: string | null; provisioningTokenHash?: string | null }>(reader: T) {
    const { apiKey: _apiKey, readerSecretCiphertext: _secret, provisioningTokenHash: _token, ...safe } = reader;
    return {
      ...safe,
      hasReaderSecret: Boolean(reader.readerSecretCiphertext),
      hasProvisioningToken: Boolean(reader.provisioningTokenHash),
      apiKeyMasked: reader.apiKey ? `${reader.apiKey.slice(0, 7)}…` : null
    };
  }

  async listReaders(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.deviceReader.count(),
      this.prisma.deviceReader.findMany({ orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.limit })
    ]);
    return { items: items.map((item) => this.redact(item)), meta: buildPaginationMeta(total, pagination) };
  }

  async getStatus(id: string) {
    const reader = await this.prisma.deviceReader.findFirst({ where: { OR: [{ id }, { deviceId: id }, { apiKey: id }] } });
    if (!reader) throw new NotFoundException('Reader tidak ditemukan.');
    return this.redact(reader);
  }

  async createReader(payload: CreateReaderDto, actor: Actor) {
    const secret = this.signatures?.generateReaderSecret() ?? `shrsec_${randomBytes(32).toString('base64url')}`;
    const encrypted = this.signatures?.encryptSecret(secret) ?? secret;
    const type = payload.type ?? ReaderType.GATE;
    const allowedModes = payload.allowedModes ?? defaultModes(type);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.deviceReader.create({
          data: {
            name: payload.name,
            apiKey: generateApiKey(),
            deviceId: payload.deviceId || null,
            readerSecretCiphertext: encrypted,
            readerSecretRotatedAt: new Date(),
            type,
            platform: payload.platform ?? (type === ReaderType.QR_ANDROID ? DevicePlatform.ANDROID : DevicePlatform.HARDWARE),
            appVersion: payload.appVersion,
            appVersionCode: payload.appVersionCode,
            allowedModes,
            locationLabel: payload.locationLabel ?? payload.locationName,
            locationName: payload.locationName ?? payload.locationLabel,
            locationLat: payload.locationLat,
            locationLng: payload.locationLng,
            createdById: actor.sub
          }
        });

        await writeAudit(tx, {
          actorId: actor.sub,
          actorRole: actor.role,
          module: 'device',
          action: type === ReaderType.QR_ANDROID ? 'reader.android.provisioned' : 'device.reader.created',
          resource: 'deviceReader',
          resourceId: created.id,
          after: { ...this.redact(created), provisionedSecretReturnedOnce: true } as Prisma.InputJsonValue
        });

        return { ...this.redact(created), readerSecret: secret, message: 'Simpan secret ini sekarang. Secret tidak akan ditampilkan lagi.' };
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Device ID/API key reader sudah terdaftar.');
      throw error;
    }
  }

  async startAndroidProvision(payload: AndroidProvisionStartDto, actor: Actor) {
    const token = generateProvisionToken();
    const expiresAt = new Date(Date.now() + Math.max(1, payload.expiresInMinutes ?? 15) * 60_000);
    const allowedModes = payload.allowedModes?.length ? payload.allowedModes : defaultModes(ReaderType.QR_ANDROID);
    const created = await this.prisma.$transaction(async (tx) => {
      const item = await tx.deviceReader.create({
        data: {
          name: payload.name,
          apiKey: generateApiKey(),
          status: DeviceReaderStatus.INACTIVE,
          type: ReaderType.QR_ANDROID,
          platform: DevicePlatform.ANDROID,
          allowedModes,
          locationLabel: payload.locationName,
          locationName: payload.locationName,
          provisioningTokenHash: sha256(token),
          provisioningExpiresAt: expiresAt,
          createdById: actor.sub
        }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'device',
        action: 'reader.android.provision.started',
        resource: 'deviceReader',
        resourceId: item.id,
        after: { ...this.redact(item), provisioningExpiresAt: expiresAt } as Prisma.InputJsonValue
      });
      return item;
    });
    return {
      item: this.redact(created),
      provisionToken: token,
      provisioningQr: `schoolhub:reader-provision:v1:${token}`,
      expiresAt,
      message: 'Scan QR provisioning ini dari APK Android. Token tidak boleh dibagikan.'
    };
  }

  async completeAndroidProvision(payload: AndroidProvisionCompleteDto) {
    const tokenHash = sha256(payload.provisionToken);
    const reader = await this.prisma.deviceReader.findUnique({ where: { provisioningTokenHash: tokenHash } });
    if (!reader) throw new NotFoundException('Token provisioning tidak ditemukan.');
    if (reader.provisioningExpiresAt && reader.provisioningExpiresAt <= new Date()) throw new ForbiddenException('Token provisioning sudah kedaluwarsa.');
    if (reader.status === DeviceReaderStatus.REVOKED) throw new ForbiddenException('Reader sudah dicabut.');
    const secret = this.signatures?.generateReaderSecret() ?? `shrsec_${randomBytes(32).toString('base64url')}`;
    const encrypted = this.signatures?.encryptSecret(secret) ?? secret;
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const item = await tx.deviceReader.update({
          where: { id: reader.id },
          data: {
            deviceId: payload.deviceId,
            name: payload.deviceName || reader.name,
            status: DeviceReaderStatus.ACTIVE,
            readerSecretCiphertext: encrypted,
            readerSecretKeyVersion: { increment: 1 },
            readerSecretRotatedAt: new Date(),
            appVersion: payload.appVersion,
            appVersionCode: payload.appVersionCode,
            provisionedAt: new Date(),
            provisioningTokenHash: null,
            provisioningExpiresAt: null,
            lastSeenAt: new Date()
          }
        });
        await writeAudit(tx, {
          module: 'device',
          action: 'reader.android.provisioned',
          resource: 'deviceReader',
          resourceId: item.id,
          after: { ...this.redact(item), provisionedSecretReturnedOnce: true } as Prisma.InputJsonValue
        });
        return item;
      });
      return { deviceId: updated.deviceId, readerId: updated.id, readerSecret: secret, allowedModes: updated.allowedModes, message: 'Perangkat Android berhasil diprovision. Secret simpan di Android Keystore.' };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Device ID Android sudah terdaftar.');
      throw error;
    }
  }

  async rotateApiKey(id: string, actor: Actor, payload: RotateReaderKeyDto = {}) {
    if (process.env.STEP_UP_FOR_READER_ROTATE === 'true') await this.stepUp?.assertRecentPassword(actor.sub, payload.stepUpPassword);
    const before = await this.prisma.deviceReader.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Reader tidak ditemukan.');
    if (before.status === DeviceReaderStatus.REVOKED) throw new ForbiddenException('Reader sudah dicabut.');
    const secret = this.signatures?.generateReaderSecret() ?? `shrsec_${randomBytes(32).toString('base64url')}`;
    const encrypted = this.signatures?.encryptSecret(secret) ?? secret;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deviceReader.update({
        where: { id },
        data: { apiKey: generateApiKey(), readerSecretCiphertext: encrypted, readerSecretKeyVersion: { increment: 1 }, readerSecretRotatedAt: new Date() }
      });

      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'device',
        action: updated.type === ReaderType.QR_ANDROID ? 'reader.android.secret.rotated' : 'device.reader.key.rotated',
        resource: 'deviceReader',
        resourceId: id,
        before: this.redact(before) as Prisma.InputJsonValue,
        after: { ...this.redact(updated), provisionedSecretReturnedOnce: true } as Prisma.InputJsonValue
      });

      return { ...this.redact(updated), readerSecret: secret, message: 'Simpan secret baru ini sekarang. Secret tidak akan ditampilkan lagi.' };
    });
  }

  async updateStatus(id: string, payload: UpdateReaderStatusDto, actor: Actor) {
    const before = await this.prisma.deviceReader.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Reader tidak ditemukan.');
    if (before.status === payload.status) throw new BadRequestException('Status reader sudah sama.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deviceReader.update({ where: { id }, data: { status: payload.status } });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'device',
        action: 'device.reader.status.updated',
        resource: 'deviceReader',
        resourceId: id,
        before: this.redact(before) as Prisma.InputJsonValue,
        after: this.redact(updated) as Prisma.InputJsonValue
      });
      return this.redact(updated);
    });
  }

  async updateReader(id: string, payload: UpdateReaderDto, actor: Actor) {
    const before = await this.prisma.deviceReader.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Reader tidak ditemukan.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.deviceReader.update({
        where: { id },
        data: {
          name: payload.name,
          locationLabel: payload.locationLabel ?? payload.locationName,
          locationName: payload.locationName ?? payload.locationLabel,
          locationLat: payload.locationLat,
          locationLng: payload.locationLng,
          allowedModes: payload.allowedModes,
          appVersion: payload.appVersion,
          appVersionCode: payload.appVersionCode
        }
      });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'device',
        action: 'device.reader.updated',
        resource: 'deviceReader',
        resourceId: id,
        before: this.redact(before) as Prisma.InputJsonValue,
        after: this.redact(item) as Prisma.InputJsonValue
      });
      return item;
    });
    return this.redact(updated);
  }

  async revoke(id: string, payload: RevokeReaderDto, actor: Actor) {
    const before = await this.prisma.deviceReader.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Reader tidak ditemukan.');
    if (before.status === DeviceReaderStatus.REVOKED) throw new BadRequestException('Reader sudah dicabut.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.deviceReader.update({ where: { id }, data: { status: DeviceReaderStatus.REVOKED, revokedAt: new Date(), revokedById: actor.sub, revokedReason: payload.reason } });
      await writeAudit(tx, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'device',
        action: before.type === ReaderType.QR_ANDROID ? 'reader.android.revoked' : 'device.reader.revoked',
        resource: 'deviceReader',
        resourceId: id,
        reason: payload.reason,
        before: this.redact(before) as Prisma.InputJsonValue,
        after: this.redact(item) as Prisma.InputJsonValue
      });
      return item;
    });
    return this.redact(updated);
  }
}
