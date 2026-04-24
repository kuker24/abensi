import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TapGateDto } from './attendance-gate.dto';
import { AttendanceGateService } from './attendance-gate.service';

@Controller('attendance/gate')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET)
export class AttendanceGateController {
  constructor(private readonly attendanceGateService: AttendanceGateService) {}

  @Get('logs')
  listLogs(
    @Query('date') date?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });

    return this.attendanceGateService.listLogs(pagination, date, userId);
  }

  @Post('tap')
  tap(@Body() body: TapGateDto, @CurrentUser() user: { sub: string }) {
    return this.attendanceGateService.tap(body, user.sub);
  }
}
