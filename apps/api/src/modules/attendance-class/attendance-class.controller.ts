import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AttendanceClassService } from './attendance-class.service';
import { BatchAttendanceDto, CorrectAttendanceDto, SessionGeoDto } from './attendance-class.dto';

@Controller('attendance/class-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceClassController {
  constructor(private readonly attendanceClassService: AttendanceClassService) {}

  @Get()
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET, Role.OPERATOR_IT)
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
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET)
  openSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Body() geo?: SessionGeoDto
  ) {
    return this.attendanceClassService.openSession(sessionId, user, geo);
  }

  @Put(':id/attendance')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET)
  recordAttendance(
    @Param('id') sessionId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Body() body: BatchAttendanceDto
  ) {
    return this.attendanceClassService.recordAttendance(sessionId, user, body);
  }

  @Post(':id/close')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET)
  closeSession(@Param('id') sessionId: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.attendanceClassService.closeSession(sessionId, user);
  }

  @Get(':id/summary')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET, Role.OPERATOR_IT)
  summary(@Param('id') sessionId: string) {
    return this.attendanceClassService.summary(sessionId);
  }

  @Get(':id/roster')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET, Role.OPERATOR_IT)
  roster(@Param('id') sessionId: string, @CurrentUser() user: { sub: string; role: string }) {
    return this.attendanceClassService.roster(sessionId, user);
  }

  @Patch(':id/attendance/:studentId')
  @Roles(Role.ADMIN_TU, Role.GURU_MAPEL, Role.GURU_PIKET)
  correctAttendance(
    @Param('id') sessionId: string,
    @Param('studentId') studentId: string,
    @Body() body: CorrectAttendanceDto,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    return this.attendanceClassService.correctAttendance(sessionId, studentId, user, body);
  }
}
