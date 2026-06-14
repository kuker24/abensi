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
import { createHmac, timingSafeEqual } from 'node:crypto';
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
import { RedisService } from '../redis/redis.service';

const workerNonceFallback = new Map<string, number>();

function safeEqual(left?: string, right?: string) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller()
export class ReconciliationController {
  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly redis: RedisService
  ) {}

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
  async runInternal(
    @Req() request: Request,
    @Headers('x-worker-token') workerToken?: string,
    @Headers('x-worker-timestamp') timestamp?: string,
    @Headers('x-worker-nonce') nonce?: string,
    @Headers('x-worker-signature') signature?: string
  ) {
    await this.assertWorker(request, workerToken, timestamp, nonce, signature);
    return this.reconciliationService.runPendingReconciliation();
  }

  @Post('internal/sessions/mark-missed')
  async markMissedInternal(
    @Req() request: Request,
    @Headers('x-worker-token') workerToken?: string,
    @Headers('x-worker-timestamp') timestamp?: string,
    @Headers('x-worker-nonce') nonce?: string,
    @Headers('x-worker-signature') signature?: string
  ) {
    await this.assertWorker(request, workerToken, timestamp, nonce, signature);
    return this.reconciliationService.runAutoMissedSessions();
  }

  private async assertWorker(request: Request, workerToken?: string, timestamp?: string, nonce?: string, signature?: string) {
    const expected = process.env.WORKER_TOKEN;
    if (process.env.NODE_ENV === 'production' && (!expected || expected === 'worker-dev-token')) {
      throw new ForbiddenException('Worker token production belum aman.');
    }
    const finalExpected = expected ?? 'worker-dev-token';
    if (!workerToken || workerToken !== finalExpected) {
      throw new ForbiddenException('Invalid worker token');
    }

    const requireSignature = process.env.NODE_ENV === 'production' || process.env.WORKER_REQUIRE_SIGNATURE === 'true';
    if (!requireSignature && !signature && !timestamp && !nonce) return;
    if (!timestamp || !nonce || !signature) throw new ForbiddenException('Worker signature headers missing');

    const parsedTimestamp = Date.parse(timestamp);
    if (!Number.isFinite(parsedTimestamp) || Math.abs(Date.now() - parsedTimestamp) > 120_000) {
      throw new ForbiddenException('Worker signature timestamp invalid');
    }

    const path = request.originalUrl.split('?')[0];
    const payload = `${timestamp}.${nonce}.${request.method.toUpperCase()}.${path}`;
    const expectedSignature = createHmac('sha256', finalExpected).update(payload).digest('hex');
    if (!safeEqual(signature, expectedSignature)) throw new ForbiddenException('Worker signature invalid');

    const nonceKey = `worker:nonce:${nonce}`;
    const inserted = await this.redis.setNxPx(nonceKey, '1', 120_000);
    if (inserted === false) throw new ForbiddenException('Worker nonce replay detected');
    if (inserted === null) {
      const now = Date.now();
      for (const [key, expiresAt] of workerNonceFallback) {
        if (expiresAt <= now) workerNonceFallback.delete(key);
      }
      if (workerNonceFallback.has(nonce)) throw new ForbiddenException('Worker nonce replay detected');
      workerNonceFallback.set(nonce, now + 120_000);
    }
  }
}
