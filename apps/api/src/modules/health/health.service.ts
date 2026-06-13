import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  live() {
    return {
      status: 'ok',
      ts: new Date().toISOString()
    };
  }

  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    await this.redis.ping();
    return {
      status: 'ready',
      ts: new Date().toISOString()
    };
  }

  async detail() {
    const startedAt = Date.now();
    const dbStartedAt = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const database = { status: 'ok', latencyMs: Date.now() - dbStartedAt };
    const redis = await this.redis.ping();
    const memory = process.memoryUsage();

    return {
      status: redis.status === 'ok' || redis.status === 'disabled' ? 'ok' : 'degraded',
      ts: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
      dependencies: {
        database,
        redis
      },
      process: {
        nodeVersion: process.version,
        memoryMb: {
          rss: Math.round(memory.rss / 1024 / 1024),
          heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memory.heapTotal / 1024 / 1024)
        }
      }
    };
  }
}
