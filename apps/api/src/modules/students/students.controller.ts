import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthenticatedUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StudentsService } from './students.service';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('me/today-status')
  @Roles(Role.SISWA)
  @Capabilities('reports.self.read')
  todayStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.studentsService.todayStatus(user);
  }
}
