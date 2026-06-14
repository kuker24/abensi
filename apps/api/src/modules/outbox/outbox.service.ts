import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export type LiveMonitorEvent = {
  id: string;
  eventType: string;
  payload: unknown;
  createdAt: Date | string;
  publishedStreamId?: string | null;
};

type ClaimedOutboxEvent = {
  id: string;
  topic: string;
  eventType: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
  logicalKey: string | null;
};

const LIVE_TOPIC = 'live-monitor';
const LIVE_REDIS_CHANNEL = 'schoolhub:live-monitor:events';
const LIVE_REDIS_STREAM = 'schoolhub:live-monitor:stream';
const PUBLISHER_LOCK_MS = 55_000;
const MAX_ATTEMPTS = 5;
const LOCAL_CONNECTION_TTL_SECONDS = 3600;

function sanitizePayload(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (/password|token|secret|hash|signature/i.test(key)) return '[REDACTED]';
    return item;
  }));
}

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private readonly publisherId = `api-${process.pid}-${randomUUID()}`;
  private interval: NodeJS.Timeout | null = null;
  private readonly localByUser = new Map<string, number>();
  private localGlobal = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  onModuleInit() {
    const disabled = process.env.OUTBOX_PUBLISHER_ENABLED === 'false';
    if (disabled) return;
    const intervalMs = Number(process.env.OUTBOX_PUBLISH_INTERVAL_MS ?? '1000');
    this.interval = setInterval(() => {
      this.publishPendingBatch().catch((error) => this.logger.warn(`Outbox publish batch failed: ${error.message}`));
    }, Number.isFinite(intervalMs) && intervalMs >= 250 ? intervalMs : 1000);
    this.interval.unref();
  }

  async onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  async publishPendingBatch(limit = 100) {
    const claimed = await this.claimPending(limit);
    let published = 0;
    let failed = 0;
    for (const event of claimed) {
      const ok = await this.publishOne(event);
      if (ok) published += 1;
      else failed += 1;
    }
    return { claimed: claimed.length, published, failed };
  }

  private async claimPending(limit: number) {
    return this.prisma.$queryRawUnsafe<ClaimedOutboxEvent[]>(`
      WITH claim AS (
        SELECT id
        FROM "OutboxEvent"
        WHERE topic = $1
          AND "publishedAt" IS NULL
          AND "dlqAt" IS NULL
          AND status IN ('PENDING', 'RETRY')
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - ($3::int * INTERVAL '1 millisecond'))
        ORDER BY "createdAt" ASC, id ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "OutboxEvent" event
      SET status = 'PUBLISHING',
          "lockedAt" = NOW(),
          "lockedBy" = $4,
          attempts = event.attempts + 1,
          "lastError" = NULL
      FROM claim
      WHERE event.id = claim.id
      RETURNING event.id, event.topic, event."eventType", event.payload, event.attempts, event."createdAt", event."logicalKey"
    `, LIVE_TOPIC, Math.max(1, Math.min(limit, 500)), PUBLISHER_LOCK_MS, this.publisherId);
  }

  private async publishOne(event: ClaimedOutboxEvent) {
    const payload = sanitizePayload(event.payload) as Prisma.InputJsonValue;
    const envelope = {
      id: event.id,
      eventType: event.eventType,
      logicalKey: event.logicalKey,
      payload,
      createdAt: event.createdAt.toISOString()
    };

    try {
      const streamId = await this.redis.xAdd(LIVE_REDIS_STREAM, {
        id: event.id,
        eventType: event.eventType,
        logicalKey: event.logicalKey ?? '',
        payload: JSON.stringify(payload),
        createdAt: event.createdAt.toISOString()
      });
      if (!streamId) throw new Error('Redis Stream publish unavailable');
      const subscribers = await this.redis.publish(LIVE_REDIS_CHANNEL, JSON.stringify({ ...envelope, publishedStreamId: streamId }));
      if (subscribers === null) throw new Error('Redis pub/sub publish unavailable');

      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PUBLISHED',
          publishedStreamId: streamId,
          publishedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
          payload
        }
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = event.attempts;
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? 'DLQ' : 'RETRY',
          dlqAt: attempts >= MAX_ATTEMPTS ? new Date() : null,
          lockedAt: null,
          lockedBy: null,
          lastError: message.slice(0, 1000)
        }
      });
      return false;
    }
  }

  async replayLiveMonitor(lastEventId: string | null, limit = 100): Promise<LiveMonitorEvent[]> {
    if (!lastEventId) return [];
    const anchor = await this.prisma.outboxEvent.findUnique({ where: { id: lastEventId } });
    if (!anchor) return [];
    return this.prisma.outboxEvent.findMany({
      where: {
        topic: LIVE_TOPIC,
        status: 'PUBLISHED',
        publishedAt: { not: null },
        createdAt: { gt: anchor.createdAt }
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(limit, 500)),
      select: { id: true, eventType: true, payload: true, createdAt: true, publishedStreamId: true }
    });
  }

  async subscribeLiveMonitor(handler: (event: LiveMonitorEvent) => void | Promise<void>) {
    return this.redis.subscribe(LIVE_REDIS_CHANNEL, async (message) => {
      const parsed = JSON.parse(message) as LiveMonitorEvent;
      parsed.payload = sanitizePayload(parsed.payload);
      await handler(parsed);
    });
  }

  async recoverStalePublishing() {
    const updated = await this.prisma.outboxEvent.updateMany({
      where: {
        topic: LIVE_TOPIC,
        status: 'PUBLISHING',
        publishedAt: null,
        lockedAt: { lt: new Date(Date.now() - PUBLISHER_LOCK_MS) }
      },
      data: { status: 'RETRY', lockedAt: null, lockedBy: null }
    });
    return updated.count;
  }

  async dlqSummary() {
    const [pending, retry, dlq] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { topic: LIVE_TOPIC, status: 'PENDING' } }),
      this.prisma.outboxEvent.count({ where: { topic: LIVE_TOPIC, status: 'RETRY' } }),
      this.prisma.outboxEvent.count({ where: { topic: LIVE_TOPIC, status: 'DLQ' } })
    ]);
    return { pending, retry, dlq };
  }

  async acquireSseConnection(userId: string, perUserLimit: number, globalLimit: number) {
    const userKey = `schoolhub:sse:live:user:${userId}`;
    const globalKey = 'schoolhub:sse:live:global';
    const [userCount, globalCount] = await Promise.all([
      this.redis.incrWithTtl(userKey, LOCAL_CONNECTION_TTL_SECONDS),
      this.redis.incrWithTtl(globalKey, LOCAL_CONNECTION_TTL_SECONDS)
    ]);

    if (userCount !== null && globalCount !== null) {
      if (userCount > perUserLimit || globalCount > globalLimit) {
        await Promise.all([this.redis.decr(userKey), this.redis.decr(globalKey)]);
        return { ok: false, distributed: true };
      }
      return { ok: true, distributed: true, release: () => Promise.all([this.redis.decr(userKey), this.redis.decr(globalKey)]).then(() => undefined) };
    }

    const currentUser = this.localByUser.get(userId) ?? 0;
    if (currentUser >= perUserLimit || this.localGlobal >= globalLimit) return { ok: false, distributed: false };
    this.localByUser.set(userId, currentUser + 1);
    this.localGlobal += 1;
    return {
      ok: true,
      distributed: false,
      release: async () => {
        this.localByUser.set(userId, Math.max(0, (this.localByUser.get(userId) ?? 1) - 1));
        this.localGlobal = Math.max(0, this.localGlobal - 1);
      }
    };
  }
}
