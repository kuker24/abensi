import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateGeofenceDto } from './access-geofence.dto';

@Injectable()
export class AccessGeofenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getPolicy() {
    const existing = await this.prisma.geofencePolicy.findUnique({ where: { id: 1 } });
    if (existing) return existing;

    return this.prisma.geofencePolicy.create({
      data: {
        id: 1,
        centerLat: 0,
        centerLng: 0,
        radiusMeter: 300,
        enforceSessionOpen: true,
        arrivalGraceMinutes: 15,
        autoMissedGraceMinutes: 15,
        requireGateTapForOpen: false,
        allowPicketOverride: true
      }
    });
  }

  async updatePolicy(payload: UpdateGeofenceDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.geofencePolicy.upsert({
        where: { id: 1 },
        update: payload,
        create: {
          id: 1,
          ...payload
        }
      });

      await tx.auditEntry.create({
        data: {
          actorId,
          module: 'access',
          action: 'access.geofence.updated',
          resource: 'geofencePolicy',
          resourceId: String(updated.id),
          after: updated
        }
      });

      return updated;
    });
  }
}
