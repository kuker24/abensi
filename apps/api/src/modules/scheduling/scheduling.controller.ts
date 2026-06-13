import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSessionDto, CreateWeeklyScheduleDto, GenerateSessionsDto, UpdateSessionScheduleDto, UpdateWeeklyScheduleDto } from './scheduling.dto';
import { SchedulingService } from './scheduling.service';

@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get('weekly')
  @Capabilities('schedules.read')
  listWeekly(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.schedulingService.listWeeklySchedules(pagination);
  }

  @Post('weekly')
  @Capabilities('schedules.manage')
  createWeekly(@Body() body: CreateWeeklyScheduleDto, @CurrentUser() user: { sub: string }) {
    return this.schedulingService.createWeeklySchedule(body, user.sub);
  }

  @Patch('weekly/:id')
  @Capabilities('schedules.manage')
  updateWeekly(@Param('id') id: string, @Body() body: UpdateWeeklyScheduleDto, @CurrentUser() user: { sub: string }) {
    return this.schedulingService.updateWeeklySchedule(id, body, user.sub);
  }

  @Post('weekly/:id/generate')
  @Capabilities('schedules.manage')
  generate(@Param('id') id: string, @Body() body: GenerateSessionsDto, @CurrentUser() user: { sub: string }) {
    return this.schedulingService.generateSessionsFromWeeklySchedule(id, body, user.sub);
  }

  @Get('sessions')
  @Capabilities('schedules.read')
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
  @Capabilities('schedules.manage')
  createSession(@Body() body: CreateSessionDto, @CurrentUser() user: { sub: string }) {
    return this.schedulingService.createSession(body, user.sub);
  }

  @Patch('sessions/:id')
  @Capabilities('schedules.manage')
  updateSessionSchedule(
    @Param('id') sessionId: string,
    @Body() body: UpdateSessionScheduleDto,
    @CurrentUser() user: { sub: string }
  ) {
    return this.schedulingService.updateSessionSchedule(sessionId, body, user.sub);
  }
}
