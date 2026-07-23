import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { parsePagination } from '../../common/pagination';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivateTutorialByRoleDto, ActivateTutorialDto, CompleteTutorialDto, DismissTutorialDto } from './tutorials.dto';
import { TutorialsService } from './tutorials.service';

@Controller('tutorials')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
export class TutorialsController {
  constructor(private readonly tutorialsService: TutorialsService) {}

  @Get('me')
  @Roles(Role.ADMIN_TU, Role.KEPALA_SEKOLAH, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
  @Capabilities('profile.self.read')
  me(@CurrentUser() user: { sub: string; role: string }, @Query('clientVersion') clientVersion?: string) {
    return this.tutorialsService.getMyTutorial(user, clientVersion);
  }

  @Post('me/complete')
  @Roles(Role.ADMIN_TU, Role.KEPALA_SEKOLAH, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
  @Capabilities('profile.self.update')
  complete(@CurrentUser() user: { sub: string; role: string }, @Body() body: CompleteTutorialDto) {
    return this.tutorialsService.completeMyTutorial(user, body.version);
  }

  @Post('me/dismiss')
  @Roles(Role.ADMIN_TU, Role.KEPALA_SEKOLAH, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
  @Capabilities('profile.self.update')
  dismiss(@CurrentUser() user: { sub: string; role: string }, @Body() body: DismissTutorialDto) {
    return this.tutorialsService.dismissMyTutorial(user, body.version);
  }

  @Get('users')
  @Roles(Role.DEVELOPER)
  @Capabilities('settings.read')
  users(@Query('page') page?: string, @Query('limit') limit?: string, @Query('role') role?: Role, @Query('search') search?: string) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.tutorialsService.listUserTutorials(pagination, { role, search });
  }

  @Post('users/:id/activate')
  @Roles(Role.DEVELOPER)
  @Capabilities('settings.manage')
  activateUser(
    @Param('id') userId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Body() body: ActivateTutorialDto
  ) {
    return this.tutorialsService.activateForUser(userId, user, body.reason, body.version);
  }

  @Post('roles/activate')
  @Roles(Role.DEVELOPER)
  @Capabilities('settings.manage')
  activateRole(@CurrentUser() user: { sub: string; role: string }, @Body() body: ActivateTutorialByRoleDto) {
    return this.tutorialsService.activateForRole(body.role, user, body.reason, body.version);
  }
}
