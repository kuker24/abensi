import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemCleanupRunDto } from './system-cleanup.dto';
import { SystemCleanupService } from './system-cleanup.service';

@Controller('system-cleanup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DEVELOPER)
export class SystemCleanupController {
  constructor(private readonly service: SystemCleanupService) {}

  @Get('preview')
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
  run(@CurrentUser() user: { sub: string; role: string }, @Body() body: SystemCleanupRunDto) {
    return this.service.run(user, body);
  }
}
