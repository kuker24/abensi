import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.KEPALA_SEKOLAH, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Capabilities('profile.self.read')
  list(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({ page, limit, defaultLimit: 20, maxLimit: 100 });
    return this.notificationsService.listForUser(user, pagination, unreadOnly === 'true');
  }

  @Patch(':id/read')
  @Capabilities('profile.self.update')
  markRead(@Param('id') id: string, @CurrentUser() user: { sub: string; role: Role }) {
    return this.notificationsService.markRead(id, user);
  }
}
