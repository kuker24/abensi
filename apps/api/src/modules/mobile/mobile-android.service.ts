import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAndroidReaderVersionDto } from './mobile-android.dto';

@Injectable()
export class MobileAndroidService {
  constructor(private readonly prisma: PrismaService) {}

  async getAndroidReaderVersion() {
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
}
