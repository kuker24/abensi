import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateGeofenceDto } from './access-geofence.dto';
import { AccessGeofenceService } from './access-geofence.service';

@Controller('access/geofence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT)
export class AccessGeofenceController {
  constructor(private readonly geofenceService: AccessGeofenceService) {}

  @Get()
  getPolicy() {
    return this.geofenceService.getPolicy();
  }

  @Put()
  updatePolicy(@Body() body: UpdateGeofenceDto, @CurrentUser() user: { sub: string }) {
    return this.geofenceService.updatePolicy(body, user.sub);
  }
}
