import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditChainService } from '../security/audit-chain.service';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly auditChain: AuditChainService
  ) {}

  @Get()
  @Capabilities('audit.read')
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('module') module?: string,
    @Query('action') action?: string
  ) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.auditService.list(pagination, { actorId, from, to, module, action });
  }

  @Get('verify-chain')
  @Capabilities('audit.read')
  verifyChain(@Query('limit') limit?: string) {
    return this.auditChain.verify(limit ? Number(limit) : 10000);
  }
}
