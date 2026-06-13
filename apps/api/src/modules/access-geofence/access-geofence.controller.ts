import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateGeofenceDto } from './access-geofence.dto';
import { AccessGeofenceService } from './access-geofence.service';

@Controller('access/geofence')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class AccessGeofenceController {
  constructor(private readonly geofenceService: AccessGeofenceService) {}

  @Get()
  @Capabilities('settings.read')
  getPolicy() {
    return this.geofenceService.getPolicy();
  }

  @Put()
  @Capabilities('settings.manage')
  updatePolicy(@Body() body: UpdateGeofenceDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.geofenceService.updatePolicy(body, user.sub, user.role);
  }
}
