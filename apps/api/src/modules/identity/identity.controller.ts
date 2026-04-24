import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUserDto, UpdateMeDto } from './identity.dto';
import { IdentityService } from './identity.service';

@Controller('identity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get('users')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT)
  listUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });

    return this.identityService.listUsers(pagination);
  }

  @Post('users')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT)
  createUser(@Body() body: CreateUserDto, @CurrentUser() user: { sub: string }) {
    return this.identityService.createUser(body, user.sub);
  }

  @Get('me')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA)
  me(@CurrentUser() user: { sub: string }) {
    return this.identityService.getMe(user.sub);
  }

  @Patch('me')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA)
  updateMe(@Body() body: UpdateMeDto, @CurrentUser() user: { sub: string }) {
    return this.identityService.updateMe(user.sub, body);
  }
}
