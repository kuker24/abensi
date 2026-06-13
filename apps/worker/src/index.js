const axios = require('axios');
const fs = require('node:fs');

const baseUrl = process.env.API_BASE_URL || 'http://api:3000/api/v1';
const reconcileUrl = process.env.API_RECONCILE_URL || `${baseUrl}/internal/reconciliation/run`;
const missedUrl = process.env.API_MARK_MISSED_URL || `${baseUrl}/internal/sessions/mark-missed`;
const token = process.env.WORKER_TOKEN || (process.env.NODE_ENV === 'production' ? '' : 'worker-dev-token');
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
const maxConsecutiveFailures = parsePositiveInt('WORKER_MAX_CONSECUTIVE_FAILURES', 5, 1);

if (!token) {
  console.error('[worker] WORKER_TOKEN wajib diatur di production.');
  process.exit(1);
}

const jobs = [
  { name: 'auto-missed', url: missedUrl, intervalMs: autoMissedIntervalMs, consecutiveFailures: 0, lastSuccessAt: null, lastError: null },
  { name: 'reconciliation', url: reconcileUrl, intervalMs: reconcileIntervalMs, consecutiveFailures: 0, lastSuccessAt: null, lastError: null }
];

function writeHealth() {
  const payload = {
    timestamp: new Date().toISOString(),
    jobs: Object.fromEntries(jobs.map((job) => [job.name, {
      intervalMs: job.intervalMs,
      lastSuccessAt: job.lastSuccessAt,
      consecutiveFailures: job.consecutiveFailures,
      lastError: job.lastError
    }]))
  };
  fs.writeFileSync(healthFile, JSON.stringify(payload));
}

async function postJob(job) {
  try {
    const startedAt = Date.now();
    const response = await axios.post(job.url, {}, { headers: { 'x-worker-token': token }, timeout: 10000 });
    job.consecutiveFailures = 0;
    job.lastSuccessAt = new Date().toISOString();
    job.lastError = null;
    writeHealth();
    console.log(`[worker] ${job.name} tick ok in ${Date.now() - startedAt}ms: ${JSON.stringify(response.data)}`);
  } catch (error) {
    const message = error.response?.data || error.message;
    job.consecutiveFailures += 1;
    job.lastError = typeof message === 'string' ? message : JSON.stringify(message);
    writeHealth();
    console.error(`[worker] ${job.name} tick failed: ${JSON.stringify(message)}`);
    const status = error.response?.status;
    if (status === 401 || status === 403 || job.consecutiveFailures >= maxConsecutiveFailures) {
      console.error(`[worker] ${job.name} gagal ${job.consecutiveFailures} kali; keluar agar healthcheck/restart menangkap masalah.`);
      process.exit(1);
    }
  }
}

function scheduleJob(job) {
  let running = false;
  const run = async () => {
    if (running) {
      console.warn(`[worker] ${job.name} skipped because previous tick is still running`);
      return;
    }
    running = true;
    try { await postJob(job); } finally { running = false; }
  };
  void run();
  setInterval(run, job.intervalMs);
}

async function main() {
  console.log(`[worker] started with jobs: ${jobs.map((job) => `${job.name}@${job.intervalMs}ms`).join(', ')}`);
  writeHealth();
  for (const job of jobs) scheduleJob(job);
}

main();
