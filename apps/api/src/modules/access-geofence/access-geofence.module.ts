import { Module } from '@nestjs/common';
import { AccessGeofenceController } from './access-geofence.controller';
import { AccessGeofenceService } from './access-geofence.service';

@Module({
  controllers: [AccessGeofenceController],
  providers: [AccessGeofenceService]
})
export class AccessGeofenceModule {}
