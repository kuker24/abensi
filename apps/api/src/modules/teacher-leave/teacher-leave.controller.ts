import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role, TeacherLeaveStatus } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CancelTeacherLeaveDto, CreateTeacherLeaveDto, ReviewTeacherLeaveDto, RevokeTeacherLeaveDto } from './teacher-leave.dto';
import { TeacherLeaveService } from './teacher-leave.service';

const APPLICANT_ROLES = [Role.ADMIN_TU, Role.KEPALA_SEKOLAH, Role.GURU_MAPEL, Role.GURU_PIKET, Role.OPERATOR_IT] as const;
const REVIEWER_ROLES = [Role.ADMIN_TU, Role.KEPALA_SEKOLAH] as const;

@Controller('teacher-leaves')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
export class TeacherLeaveController {
  constructor(private readonly teacherLeaveService: TeacherLeaveService) {}

  @Get('me')
  @Roles(...APPLICANT_ROLES)
  @Capabilities('leave.self.manage')
  listMine(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('status') status?: TeacherLeaveStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.teacherLeaveService.listMine(user, pagination, status);
  }

  @Post()
  @Roles(...APPLICANT_ROLES)
  @Capabilities('leave.self.manage')
  create(@CurrentUser() user: { sub: string; role: Role }, @Body() body: CreateTeacherLeaveDto) {
    return this.teacherLeaveService.create(user, body);
  }

  @Patch(':id/cancel')
  @Roles(...APPLICANT_ROLES)
  @Capabilities('leave.self.manage')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Body() body: CancelTeacherLeaveDto
  ) {
    return this.teacherLeaveService.cancel(id, user, body);
  }

  @Get('review')
  @Roles(...REVIEWER_ROLES)
  @Capabilities('leave.review')
  listForReview(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('status') status?: TeacherLeaveStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.teacherLeaveService.listForReview(user, pagination, status);
  }

  @Patch(':id/review')
  @Roles(...REVIEWER_ROLES)
  @Capabilities('leave.review')
  review(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Body() body: ReviewTeacherLeaveDto
  ) {
    return this.teacherLeaveService.review(id, user, body);
  }

  @Patch(':id/revoke')
  @Roles(...REVIEWER_ROLES)
  @Capabilities('leave.review')
  revoke(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Body() body: RevokeTeacherLeaveDto
  ) {
    return this.teacherLeaveService.revoke(id, user, body);
  }
}
