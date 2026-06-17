import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live() {
    return this.healthService.live();
  }

  @Get('ready')
  ready() {
    return this.healthService.ready();
  }

  @Get('detail')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('settings.read')
  detail() {
    return this.healthService.detail();
  }
}
