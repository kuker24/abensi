const axios = require('axios');
const fs = require('node:fs');
const { createHmac, randomUUID } = require('node:crypto');
const { Queue, Worker, QueueEvents } = require('bullmq');
const { repairStaleRepeatables } = require('./repeatable-scheduler');

const baseUrl = process.env.API_BASE_URL || 'http://api:3000/api/v1';
const reconcileUrl = process.env.API_RECONCILE_URL || `${baseUrl}/internal/reconciliation/run`;
const missedUrl = process.env.API_MARK_MISSED_URL || `${baseUrl}/internal/sessions/mark-missed`;
const token = process.env.WORKER_TOKEN || (process.env.NODE_ENV === 'production' ? '' : 'worker-dev-token');
const redisUrl = process.env.REDIS_URL || (process.env.NODE_ENV === 'production' ? '' : 'redis://redis:6379');
const queueName = process.env.WORKER_QUEUE_NAME || 'schoolhub-worker';
const healthFile = process.env.WORKER_HEALTH_FILE || '/tmp/schoolhub-worker-health.json';

function parsePositiveInt(name, fallback, minimum = 5000) {
  const raw = process.env[name] || String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    console.error(`[worker] ${name} wajib integer >= ${minimum}, diterima: ${raw}`);
    process.exit(1);
  }
  return value;
}

const defaultIntervalMs = parsePositiveInt('WORKER_INTERVAL_MS', 15000);
const autoMissedIntervalMs = parsePositiveInt('WORKER_AUTO_MISSED_INTERVAL_MS', defaultIntervalMs);
const reconcileIntervalMs = parsePositiveInt('WORKER_RECONCILE_INTERVAL_MS', Math.max(defaultIntervalMs, 30000));
const attempts = parsePositiveInt('WORKER_JOB_ATTEMPTS', 5, 1);
const staleHealthMs = parsePositiveInt('WORKER_STALE_HEALTH_MS', Math.max(reconcileIntervalMs * 3, 60000), 10000);

if (!token) {
  console.error('[worker] WORKER_TOKEN wajib diatur di production.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && token.length < 32) {
  console.error('[worker] WORKER_TOKEN produksi wajib minimal 32 karakter acak.');
  process.exit(1);
}
if (!redisUrl) {
  console.error('[worker] REDIS_URL wajib diatur; worker produksi memakai BullMQ/Redis, bukan setInterval lokal.');
  process.exit(1);
}

const connection = { url: redisUrl, maxRetriesPerRequest: null };
const queue = new Queue(queueName, { connection });
const dlqName = process.env.WORKER_DLQ_NAME || `${queueName}-dlq`;
const dlq = new Queue(dlqName, { connection });
const queueEvents = new QueueEvents(queueName, { connection });

const jobDefinitions = [
  { name: 'auto-missed', url: missedUrl, intervalMs: autoMissedIntervalMs },
  { name: 'reconciliation', url: reconcileUrl, intervalMs: reconcileIntervalMs }
];

const health = {
  startedAt: new Date().toISOString(),
  timestamp: new Date().toISOString(),
  queueName,
  staleHealthMs,
  jobs: Object.fromEntries(jobDefinitions.map((job) => [job.name, {
    intervalMs: job.intervalMs,
    lastSuccessAt: null,
    lastError: null,
    lastDurationMs: null,
    processed: 0,
    failed: 0
  }]))
};

function writeHealth() {
  health.timestamp = new Date().toISOString();
  fs.writeFileSync(healthFile, JSON.stringify(health));
}

function signHeaders(url, jobName) {
  const parsed = new URL(url);
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const path = parsed.pathname;
  const payload = `${timestamp}.${nonce}.POST.${path}`;
  const signature = createHmac('sha256', token).update(payload).digest('hex');
  return {
    'x-worker-token': token,
    'x-worker-timestamp': timestamp,
    'x-worker-nonce': nonce,
    'x-worker-signature': signature,
    'x-worker-job': jobName
  };
}

async function postJob(job) {
  const definition = jobDefinitions.find((item) => item.name === job.name);
  if (!definition) throw new Error(`Unknown job: ${job.name}`);
  const startedAt = Date.now();
  const response = await axios.post(definition.url, {}, { headers: signHeaders(definition.url, definition.name), timeout: 10000 });
  const state = health.jobs[definition.name];
  state.lastSuccessAt = new Date().toISOString();
  state.lastError = null;
  state.lastDurationMs = Date.now() - startedAt;
  state.processed += 1;
  writeHealth();
  console.log(`[worker] ${definition.name} ok in ${state.lastDurationMs}ms: ${JSON.stringify(response.data)}`);
  return response.data;
}

const worker = new Worker(queueName, postJob, {
  connection,
  concurrency: Number(process.env.WORKER_CONCURRENCY || '1'),
  lockDuration: parsePositiveInt('WORKER_LOCK_DURATION_MS', 30000, 5000)
});

worker.on('failed', async (job, error) => {
  const name = job?.name || 'unknown';
  const state = health.jobs[name] || (health.jobs[name] = { intervalMs: null, lastSuccessAt: null, lastError: null, lastDurationMs: null, processed: 0, failed: 0 });
  state.failed += 1;
  state.lastError = error.message;
  writeHealth();
  console.error(`[worker] ${name} failed attempt ${job?.attemptsMade}: ${error.message}`);
  if (job && job.attemptsMade >= attempts) {
    await dlq.add(name, {
      originalJobId: job.id,
      failedReason: error.message,
      data: job.data,
      failedAt: new Date().toISOString()
    }, { jobId: `dlq:${job.id}:${job.attemptsMade}`, removeOnComplete: 1000 });
  }
});

queueEvents.on('stalled', ({ jobId }) => {
  console.warn(`[worker] job stalled: ${jobId}`);
});

async function scheduleRepeatableJobs() {
  const repaired = await repairStaleRepeatables(queue, jobDefinitions);
  if (repaired.length > 0) {
    console.warn(`[worker] repaired stale repeatable schedules: ${repaired.map((job) => job.name).join(', ')}`);
  }
  for (const definition of jobDefinitions) {
    await queue.add(definition.name, { scheduledBy: 'schoolhub-worker' }, {
      jobId: `repeat:${definition.name}`,
      repeat: { every: definition.intervalMs, immediately: true },
      attempts,
      backoff: { type: 'exponential', delay: Number(process.env.WORKER_JOB_BACKOFF_MS || '5000') },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 }
    });
  }
}

async function readinessLoop() {
  const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  health.queue = counts;
  const now = Date.now();
  health.ready = Object.values(health.jobs).every((job) => {
    if (!job.lastSuccessAt) return true;
    return now - Date.parse(job.lastSuccessAt) <= staleHealthMs;
  });
  writeHealth();
}

async function shutdown(signal) {
  console.log(`[worker] received ${signal}, shutting down gracefully...`);
  await worker.close();
  await queueEvents.close();
  await queue.close();
  await dlq.close();
  process.exit(0);
}

async function main() {
  console.log(`[worker] BullMQ started with jobs: ${jobDefinitions.map((job) => `${job.name}@${job.intervalMs}ms`).join(', ')}`);
  writeHealth();
  await scheduleRepeatableJobs();
  await readinessLoop();
  setInterval(() => { readinessLoop().catch((error) => console.error(`[worker] readiness failed: ${error.message}`)); }, 10000).unref();
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

main().catch((error) => {
  console.error('[worker] fatal startup error');
  console.error(error);
  process.exit(1);
});
