import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { parsePagination } from '../../common/pagination';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivateTutorialByRoleDto, ActivateTutorialDto, CompleteTutorialDto, DismissTutorialDto } from './tutorials.dto';
import { TutorialsService } from './tutorials.service';

@Controller('tutorials')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TutorialsController {
  constructor(private readonly tutorialsService: TutorialsService) {}

  @Get('me')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
  me(@CurrentUser() user: { sub: string; role: string }) {
    return this.tutorialsService.getMyTutorial(user);
  }

  @Post('me/complete')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
  complete(@CurrentUser() user: { sub: string; role: string }, @Body() body: CompleteTutorialDto) {
    return this.tutorialsService.completeMyTutorial(user, body.version);
  }

  @Post('me/dismiss')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
  dismiss(@CurrentUser() user: { sub: string; role: string }, @Body() body: DismissTutorialDto) {
    return this.tutorialsService.dismissMyTutorial(user, body.version);
  }

  @Get('users')
  @Roles(Role.DEVELOPER)
  users(@Query('page') page?: string, @Query('limit') limit?: string, @Query('role') role?: Role, @Query('search') search?: string) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.tutorialsService.listUserTutorials(pagination, { role, search });
  }

  @Post('users/:id/activate')
  @Roles(Role.DEVELOPER)
  activateUser(
    @Param('id') userId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Body() body: ActivateTutorialDto
  ) {
    return this.tutorialsService.activateForUser(userId, user, body.reason, body.version);
  }

  @Post('roles/activate')
  @Roles(Role.DEVELOPER)
  activateRole(@CurrentUser() user: { sub: string; role: string }, @Body() body: ActivateTutorialByRoleDto) {
    return this.tutorialsService.activateForRole(body.role, user, body.reason, body.version);
  }
}
