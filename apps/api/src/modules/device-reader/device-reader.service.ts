import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReaderDto, UpdateReaderStatusDto } from './device-reader.dto';

function generateApiKey() {
  return `shr_${randomBytes(16).toString('hex')}`;
}

@Injectable()
export class DeviceReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async listReaders(pagination: PaginationQuery) {
    const [total, items] = await Promise.all([
      this.prisma.deviceReader.count(),
      this.prisma.deviceReader.findMany({
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }

  async createReader(payload: CreateReaderDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.deviceReader.create({
        data: {
          name: payload.name,
          apiKey: generateApiKey(),
          locationLat: payload.locationLat,
          locationLng: payload.locationLng
        }
      });

      await tx.auditEntry.create({
        data: {
          actorId,
          module: 'device',
          action: 'device.reader.created',
          resource: 'deviceReader',
          resourceId: created.id,
          after: {
            ...created,
            apiKey: '***'
          }
        }
      });

      return created;
    });
  }

  async rotateApiKey(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deviceReader.update({
        where: { id },
        data: {
          apiKey: generateApiKey()
        }
      });

      await tx.auditEntry.create({
        data: {
          actorId,
          module: 'device',
          action: 'device.reader.apikey.rotated',
          resource: 'deviceReader',
          resourceId: id,
          after: { rotated: true }
        }
      });

      return updated;
    });
  }

  async updateStatus(id: string, payload: UpdateReaderStatusDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deviceReader.update({
        where: { id },
        data: {
          status: payload.status
        }
      });

      await tx.auditEntry.create({
        data: {
          actorId,
          module: 'device',
          action: 'device.reader.status.updated',
          resource: 'deviceReader',
          resourceId: id,
          after: updated
        }
      });

      return updated;
    });
  }
}
