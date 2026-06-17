import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AttendanceClassService } from './attendance-class.service';
import { BatchAttendanceDto, CloseSessionDto, CorrectAttendanceDto, RepairSessionRosterDto, SessionGeoDto } from './attendance-class.dto';

@Controller('attendance/class-sessions')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
export class AttendanceClassController {
  constructor(private readonly attendanceClassService: AttendanceClassService) {}

  @Get()
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('classAttendance.read')
  listSessions(
    @CurrentUser() user: { sub: string; role: string },
    @Query('date') date?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });

    return this.attendanceClassService.listSessions(user, pagination, date);
  }

  @Post(':id/open')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('session.open')
  openSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Body() geo?: SessionGeoDto
  ) {
    return this.attendanceClassService.openSession(sessionId, user, geo);
  }

  @Put(':id/attendance')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.DEVELOPER)
  @Capabilities('classAttendance.record')
  recordAttendance(
    @Param('id') sessionId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Body() body: BatchAttendanceDto
  ) {
    return this.attendanceClassService.recordAttendance(sessionId, user, body);
  }

  @Post(':id/attendance/bulk-present')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.DEVELOPER)
  @Capabilities('classAttendance.record')
  bulkConfirmPresent(
    @Param('id') sessionId: string,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    return this.attendanceClassService.bulkConfirmPresent(sessionId, user);
  }

  @Post(':id/attendance/bulk-alpa')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.DEVELOPER)
  @Capabilities('classAttendance.record')
  bulkConfirmAlpa(
    @Param('id') sessionId: string,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    return this.attendanceClassService.bulkConfirmAlpa(sessionId, user);
  }

  @Post(':id/close')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('session.close')
  closeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Body() body?: CloseSessionDto
  ) {
    return this.attendanceClassService.closeSession(sessionId, user, body ?? {});
  }

  @Get(':id/summary')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('classAttendance.read')
  summary(@Param('id') sessionId: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.attendanceClassService.summary(sessionId, user);
  }

  @Get(':id/roster')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('classAttendance.read')
  roster(@Param('id') sessionId: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.attendanceClassService.roster(sessionId, user);
  }

  @Post(':id/roster/repair')
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('classAttendance.correct')
  repairRoster(
    @Param('id') sessionId: string,
    @Body() body: RepairSessionRosterDto,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    return this.attendanceClassService.repairSessionRoster(sessionId, user, body.reason);
  }

  @Patch(':id/attendance/:studentId')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.DEVELOPER)
  @Capabilities('classAttendance.correct')
  correctAttendance(
    @Param('id') sessionId: string,
    @Param('studentId') studentId: string,
    @Body() body: CorrectAttendanceDto,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    return this.attendanceClassService.correctAttendance(sessionId, studentId, user, body);
  }
}
