import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { extractRequestMeta } from '../../common/request-meta';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PilotCleanupPreviewDto, PilotCleanupRunDto, SystemCleanupRunDto } from './system-cleanup.dto';
import { SystemCleanupService } from './system-cleanup.service';

@Controller('system-cleanup')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
export class SystemCleanupController {
  constructor(private readonly service: SystemCleanupService) {}

  @Get('preview')
  @Roles(Role.DEVELOPER)
  @Capabilities('settings.manage')
  preview(
    @CurrentUser() user: { sub: string; role: string },
    @Query('inactiveTestUsers') inactiveTestUsers?: string,
    @Query('inactiveUserCards') inactiveUserCards?: string,
    @Query('readNotifications') readNotifications?: string,
    @Query('staleTutorialStates') staleTutorialStates?: string,
    @Query('olderThanDays') olderThanDays?: string
  ) {
    const bool = (value?: string) => value === undefined ? undefined : value === 'true';
    return this.service.preview(user, {
      inactiveTestUsers: bool(inactiveTestUsers),
      inactiveUserCards: bool(inactiveUserCards),
      readNotifications: bool(readNotifications),
      staleTutorialStates: bool(staleTutorialStates),
      olderThanDays: olderThanDays ? Number(olderThanDays) : undefined
    });
  }

  @Post('run')
  @Roles(Role.DEVELOPER)
  @Capabilities('settings.manage')
  run(@CurrentUser() user: { sub: string; role: string }, @Body() body: SystemCleanupRunDto) {
    return this.service.run(user, body);
  }

  @Post('pilot/preview')
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('settings.manage')
  previewPilot(@CurrentUser() user: { sub: string; role: string }, @Body() body: PilotCleanupPreviewDto) {
    return this.service.previewPilot(user, body);
  }

  @Post('pilot/run')
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('settings.manage')
  runPilot(
    @CurrentUser() user: { sub: string; role: string },
    @Body() body: PilotCleanupRunDto,
    @Req() request: Request
  ) {
    return this.service.runPilot(user, body, extractRequestMeta(request));
  }
}
