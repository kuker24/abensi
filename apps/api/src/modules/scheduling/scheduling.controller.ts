import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSessionDto, UpdateSessionScheduleDto } from './scheduling.dto';
import { SchedulingService } from './scheduling.service';

@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get('sessions')
  listSessions(
    @Query('date') date?: string,
    @Query('teacherId') teacherId?: string,
    @Query('classId') classId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });

    return this.schedulingService.listSessions(pagination, date, teacherId, classId);
  }

  @Post('sessions')
  createSession(@Body() body: CreateSessionDto, @CurrentUser() user: { sub: string }) {
    return this.schedulingService.createSession(body, user.sub);
  }

  @Patch('sessions/:id')
  updateSessionSchedule(
    @Param('id') sessionId: string,
    @Body() body: UpdateSessionScheduleDto,
    @CurrentUser() user: { sub: string }
  ) {
    return this.schedulingService.updateSessionSchedule(sessionId, body, user.sub);
  }
}
