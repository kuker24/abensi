import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role, TeacherLeaveStatus } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTeacherLeaveDto, ReviewTeacherLeaveDto } from './teacher-leave.dto';
import { TeacherLeaveService } from './teacher-leave.service';

@Controller('teacher-leaves')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
export class TeacherLeaveController {
  constructor(private readonly teacherLeaveService: TeacherLeaveService) {}

  @Get()
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('classAttendance.read')
  list(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('status') status?: TeacherLeaveStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.teacherLeaveService.list(user, pagination, status);
  }

  @Post()
  @Roles(Role.GURU_MAPEL, Role.GURU_PIKET)
  @Capabilities('classAttendance.record')
  create(@CurrentUser() user: { sub: string; role: Role }, @Body() body: CreateTeacherLeaveDto) {
    return this.teacherLeaveService.create(user, body);
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('classAttendance.correct')
  review(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Body() body: ReviewTeacherLeaveDto
  ) {
    return this.teacherLeaveService.review(id, user, body);
  }
}
