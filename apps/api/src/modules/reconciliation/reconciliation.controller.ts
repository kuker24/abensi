import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import type { Request } from 'express';
import { ReconciliationFlagType, ReconciliationStatus, Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { extractRequestMeta } from '../../common/request-meta';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EscalateFlagDto, ResolveFlagDto, UpdateFlagWorkflowDto } from './reconciliation.dto';
import { ReconciliationService } from './reconciliation.service';

@Controller()
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('reconciliation/flags')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('reconciliation.read')
  listFlags(
    @Query('status') status?: ReconciliationStatus,
    @Query('type') type?: ReconciliationFlagType,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });

    return this.reconciliationService.listFlags(status, type, pagination, { from, to });
  }

  @Post('reconciliation/flags/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('reconciliation.resolve')
  resolveFlag(
    @Param('id') flagId: string,
    @Body() body: ResolveFlagDto,
    @CurrentUser() user: { sub: string; role: Role },
    @Req() request: Request
  ) {
    return this.reconciliationService.resolveFlag(flagId, body.reason, user, extractRequestMeta(request));
  }

  @Patch('reconciliation/flags/:id/workflow')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('reconciliation.escalate')
  updateWorkflow(
    @Param('id') flagId: string,
    @Body() body: UpdateFlagWorkflowDto,
    @CurrentUser() user: { sub: string; role: Role },
    @Req() request: Request
  ) {
    return this.reconciliationService.updateFlagWorkflow(flagId, body, user, extractRequestMeta(request));
  }

  @Post('reconciliation/flags/:id/escalate')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('reconciliation.escalate')
  escalateFlag(
    @Param('id') flagId: string,
    @Body() body: EscalateFlagDto,
    @CurrentUser() user: { sub: string; role: Role },
    @Req() request: Request
  ) {
    return this.reconciliationService.escalateFlag(flagId, body.reason, user, extractRequestMeta(request));
  }

  @Post('internal/reconciliation/run')
  runInternal(@Headers('x-worker-token') workerToken?: string) {
    this.assertWorker(workerToken);
    return this.reconciliationService.runPendingReconciliation();
  }

  @Post('internal/sessions/mark-missed')
  markMissedInternal(@Headers('x-worker-token') workerToken?: string) {
    this.assertWorker(workerToken);
    return this.reconciliationService.runAutoMissedSessions();
  }

  private assertWorker(workerToken?: string) {
    const expected = process.env.WORKER_TOKEN;
    if (process.env.NODE_ENV === 'production' && (!expected || expected === 'worker-dev-token')) {
      throw new ForbiddenException('Worker token production belum aman.');
    }
    const finalExpected = expected ?? 'worker-dev-token';
    if (!workerToken || workerToken !== finalExpected) {
      throw new ForbiddenException('Invalid worker token');
    }
  }
}
