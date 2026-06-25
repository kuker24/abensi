import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TeacherService } from './teacher.service';

@Controller('teacher')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
export class TeacherController {
  constructor(private readonly teacherService: TeacherService) {}

  @Get('today')
  @Roles(Role.GURU_MAPEL)
  @Capabilities('classAttendance.read')
  today(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('date') date?: string
  ) {
    return this.teacherService.today(user, date);
  }
}
