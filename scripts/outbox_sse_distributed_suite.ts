import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaService } from '../apps/api/src/prisma/prisma.service';
import { RedisService } from '../apps/api/src/modules/redis/redis.service';
import { OutboxService, type LiveMonitorEvent } from '../apps/api/src/modules/outbox/outbox.service';

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function main() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for outbox/SSE distributed suite.');
  const outputPath = resolve(process.argv.find((arg) => arg.startsWith('--json='))?.slice('--json='.length) ?? 'artifacts/outbox-sse/outbox-sse-distributed.json');
  const prefix = id('outboxsse');
  const prisma = new PrismaService();
  const redisA = new RedisService();
  const redisB = new RedisService();
  const replicaA = new OutboxService(prisma, redisA);
  const replicaB = new OutboxService(prisma, redisB);
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

  await prisma.$connect();
  try {
    const receivedA: LiveMonitorEvent[] = [];
    const receivedB: LiveMonitorEvent[] = [];
    const unsubscribeA = await replicaA.subscribeLiveMonitor((event) => { receivedA.push(event); });
    const unsubscribeB = await replicaB.subscribeLiveMonitor((event) => { receivedB.push(event); });

    const live = await prisma.outboxEvent.create({
      data: {
        id: `${prefix}-live`,
        topic: 'live-monitor',
        eventType: 'suite.live',
        aggregateType: 'suite',
        aggregateId: prefix,
        logicalKey: `${prefix}:live`,
        payload: { prefix, password: 'must-redact' }
      }
    });
    await replicaA.publishPendingBatch(10);
    const bothReceived = await waitFor(() => receivedA.some((event) => event.id === live.id) && receivedB.some((event) => event.id === live.id));
    const redacted = receivedA.find((event) => event.id === live.id)?.payload as { password?: string } | undefined;
    results.push({ name: 'two_clients_cross_replica_receive_live_event_without_reconnect', ok: bothReceived && redacted?.password === '[REDACTED]', detail: `receivedA=${receivedA.length}, receivedB=${receivedB.length}, redacted=${redacted?.password}` });

    if (unsubscribeA) await unsubscribeA();
    if (unsubscribeB) await unsubscribeB();

    const anchor = await prisma.outboxEvent.create({
      data: { id: `${prefix}-anchor`, topic: 'live-monitor', eventType: 'suite.anchor', aggregateType: 'suite', aggregateId: prefix, logicalKey: `${prefix}:anchor`, payload: { prefix } }
    });
    await replicaA.publishPendingBatch(10);
    const missed = await prisma.outboxEvent.create({
      data: { id: `${prefix}-missed`, topic: 'live-monitor', eventType: 'suite.missed', aggregateType: 'suite', aggregateId: prefix, logicalKey: `${prefix}:missed`, payload: { prefix, value: 'after-anchor' } }
    });
    await replicaB.publishPendingBatch(10);
    const replay = await replicaA.replayLiveMonitor(anchor.id, 10);
    results.push({ name: 'last_event_id_durable_resume_replays_missed_event', ok: replay.some((event) => event.id === missed.id), detail: `replay=${replay.map((event) => event.id).join(',')}` });

    await prisma.outboxEvent.create({
      data: { id: `${prefix}-stale`, topic: 'live-monitor', eventType: 'suite.stale', aggregateType: 'suite', aggregateId: prefix, logicalKey: `${prefix}:stale`, payload: { prefix }, status: 'PUBLISHING', lockedAt: new Date(Date.now() - 120_000), lockedBy: 'dead-replica' }
    });
    const recovered = await replicaB.recoverStalePublishing();
    const stale = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: `${prefix}-stale` } });
    results.push({ name: 'stale_publish_recovery_after_replica_or_redis_restart', ok: recovered >= 1 && stale.status === 'RETRY', detail: `recovered=${recovered}, status=${stale.status}` });

    await prisma.outboxEvent.create({
      data: { id: `${prefix}-logical-1`, topic: 'live-monitor', eventType: 'suite.logical', aggregateType: 'suite', aggregateId: prefix, logicalKey: `${prefix}:logical`, payload: { prefix } }
    });
    try {
      await prisma.outboxEvent.create({
        data: { id: `${prefix}-logical-2`, topic: 'live-monitor', eventType: 'suite.logical', aggregateType: 'suite', aggregateId: prefix, logicalKey: `${prefix}:logical`, payload: { prefix } }
      });
      results.push({ name: 'duplicate_logical_event_rejected_by_database', ok: false, detail: 'duplicate logicalKey insert succeeded' });
    } catch {
      results.push({ name: 'duplicate_logical_event_rejected_by_database', ok: true });
    }

    const controllerSource = await import('node:fs').then((fs) => fs.readFileSync(resolve('apps/api/src/modules/reporting/reporting.controller.ts'), 'utf8'));
    const perClientDbPolling = /setInterval\([^]*outboxEvent\.findMany/.test(controllerSource) || /setInterval\([^]*liveMonitor\(/.test(controllerSource);
    results.push({ name: 'no_periodic_per_client_db_polling_in_sse_controller', ok: !perClientDbPolling, detail: `perClientDbPolling=${perClientDbPolling}` });
  } finally {
    await redisA.onModuleDestroy();
    await redisB.onModuleDestroy();
    await prisma.$disconnect();
  }

  const ok = results.every((result) => result.ok);
  const report = { generatedAt: new Date().toISOString(), prefix, ok, scenarioCount: results.length, results };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
