import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { parsePagination } from '../../common/pagination';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePicketNoteDto, UpdatePicketNoteDto } from './picket-book.dto';
import { PicketBookService } from './picket-book.service';

@Controller('picket-notes')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
export class PicketBookController {
  constructor(private readonly service: PicketBookService) {}

  @Get()
  @Capabilities('reconciliation.read')
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('date') date?: string,
    @Query('category') category?: string,
    @Query('severity') severity?: string,
    @Query('active') active?: string
  ) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.service.list(pagination, { date, category, severity, active });
  }

  @Post()
  @Capabilities('reconciliation.escalate')
  create(@Body() body: CreatePicketNoteDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.service.create(body, user);
  }

  @Patch(':id')
  @Capabilities('reconciliation.escalate')
  update(@Param('id') id: string, @Body() body: UpdatePicketNoteDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @Capabilities('reconciliation.resolve')
  deactivate(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() user: { sub: string; role: string }) {
    return this.service.deactivate(id, user, body?.reason);
  }
}
