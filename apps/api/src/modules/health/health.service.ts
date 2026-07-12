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

  private async assertRequiredSchema() {
    const requiredTables = ['_prisma_migrations', 'User', 'Session', 'GeofencePolicy', 'AuthSession', 'GateLog', 'AuditEntry', 'AuditChainEpoch', 'AuditIntegrityIncident'];
    const rows = await this.prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('_prisma_migrations', 'User', 'Session', 'GeofencePolicy', 'AuthSession', 'GateLog', 'AuditEntry', 'AuditChainEpoch', 'AuditIntegrityIncident')
    `;
    const present = new Set(rows.map((row) => row.table_name));
    const missing = requiredTables.filter((table) => !present.has(table));
    if (missing.length) {
      throw new Error(`Database schema is not ready. Missing tables: ${missing.join(', ')}`);
    }
  }

  async ready() {
    await this.assertRequiredSchema();
    await this.redis.ping();
    return {
      status: 'ready',
      ts: new Date().toISOString()
    };
  }

  async detail() {
    const startedAt = Date.now();
    const dbStartedAt = Date.now();
    await this.assertRequiredSchema();
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
