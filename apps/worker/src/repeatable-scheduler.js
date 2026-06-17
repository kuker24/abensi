'use strict';

const MAX_DEFINITIONS = 10;
const MAX_REPEAT_KEY_LENGTH = 512;
const DEFAULT_MAX_REPAIRS = 2;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 100;
const DEFAULT_MAX_PAST_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_FUTURE_MS = 30 * 24 * 60 * 60 * 1000;
const SAFE_REPEAT_KEY = /^[A-Za-z0-9:_-]+$/;
const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

function finiteInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function positiveInteger(value) {
  const number = finiteInteger(value);
  return number !== null && number > 0 ? number : null;
}

function sanitizeDefinitions(definitions, queueName) {
  if (!Array.isArray(definitions) || definitions.length === 0 || definitions.length > MAX_DEFINITIONS) return [];
  const seen = new Set();
  const result = [];
  for (const definition of definitions) {
    if (!definition || definition.queueName !== queueName) return [];
    if (typeof definition.name !== 'string' || !SAFE_NAME.test(definition.name)) return [];
    if (typeof definition.jobId !== 'string' || definition.jobId !== `repeat:${definition.name}`) return [];
    const intervalMs = positiveInteger(definition.intervalMs);
    const maxRepairs = positiveInteger(definition.maxRepairs ?? 1);
    if (!intervalMs || intervalMs < 5000 || intervalMs > 24 * 60 * 60 * 1000) return [];
    if (!maxRepairs || maxRepairs > 2) return [];
    const identity = `${definition.queueName}\u0000${definition.name}\u0000${intervalMs}\u0000${definition.jobId}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    result.push(Object.freeze({
      queueName: definition.queueName,
      name: definition.name,
      intervalMs,
      jobId: definition.jobId,
      maxRepairs,
      repeat: Object.freeze({ every: intervalMs, immediately: true })
    }));
  }
  return result;
}

function hasExpectedRepeatKeyShape(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_REPEAT_KEY_LENGTH
    && SAFE_REPEAT_KEY.test(value);
}

function isExactExpectedRepeatable(job, definition, queueName) {
  if (!job || definition.queueName !== queueName) return false;
  if (job.name !== definition.name) return false;
  if (job.id !== undefined && job.id !== null && job.id !== definition.jobId) return false;
  if (positiveInteger(job.every) !== definition.intervalMs) return false;
  if (job.pattern !== undefined && job.pattern !== null && job.pattern !== '') return false;
  return hasExpectedRepeatKeyShape(job.key);
}

function isRepeatableStale(job, nowMs, graceMs, bounds = {}) {
  const now = positiveInteger(nowMs);
  const grace = positiveInteger(graceMs);
  const next = positiveInteger(job?.next);
  if (!now || !grace || !next) return false;
  const maxPastMs = positiveInteger(bounds.maxPastMs) || DEFAULT_MAX_PAST_MS;
  const maxFutureMs = positiveInteger(bounds.maxFutureMs) || DEFAULT_MAX_FUTURE_MS;
  if (next < now - maxPastMs || next > now + maxFutureMs) return false;
  return next + grace < now;
}

function queueIsIdle(counts) {
  if (!counts || typeof counts !== 'object') return false;
  const waiting = finiteInteger(counts.waiting);
  const active = finiteInteger(counts.active);
  const delayed = finiteInteger(counts.delayed);
  if (waiting === null || active === null || delayed === null) return false;
  if (waiting < 0 || active < 0 || delayed < 0) return false;
  return waiting === 0 && active === 0 && delayed === 0;
}

function selectStaleDefinitions(repeatableJobs, definitions, queueName, nowMs, graceMs, bounds = {}) {
  if (!Array.isArray(repeatableJobs)) return [];
  const selected = [];
  for (const definition of definitions) {
    const matches = repeatableJobs.filter((job) => isExactExpectedRepeatable(job, definition, queueName));
    if (matches.length !== 1) continue;
    if (isRepeatableStale(matches[0], nowMs, graceMs, bounds)) selected.push(definition);
  }
  return selected;
}

function findMissingExpectedDefinitions(repeatableJobs, definitions, queueName) {
  if (!Array.isArray(repeatableJobs)) return [];
  return definitions.filter((definition) => {
    const matches = repeatableJobs.filter((job) => isExactExpectedRepeatable(job, definition, queueName));
    return matches.length === 0;
  });
}

function safeLog(logger, event, scheduleName, attempt) {
  if (typeof logger !== 'function') return;
  logger({ event, schedule: scheduleName || null, attempt: attempt || null });
}

async function withBoundedRetry(operation, options = {}) {
  const attempts = Math.min(positiveInteger(options.attempts) || DEFAULT_RETRY_ATTEMPTS, 3);
  const delayMs = Math.min(positiveInteger(options.delayMs) || DEFAULT_RETRY_DELAY_MS, 1000);
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      safeLog(options.logger, 'retry', options.scheduleName, attempt);
      if (attempt < attempts) await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}

async function readQueueState(queue, retryOptions) {
  return withBoundedRetry(
    () => queue.getJobCounts('waiting', 'active', 'delayed'),
    retryOptions
  );
}

async function readRepeatables(queue, retryOptions) {
  return withBoundedRetry(() => queue.getRepeatableJobs(), retryOptions);
}

async function repairStaleRepeatables(queue, definitions, options = {}) {
  const queueName = String(options.queueName || queue?.name || '');
  const allowlist = sanitizeDefinitions(definitions, queueName);
  if (allowlist.length === 0) return { repaired: [], skipped: 'invalid_or_empty_allowlist' };

  const nowMs = positiveInteger(options.nowMs) || Date.now();
  const largestInterval = Math.max(...allowlist.map((definition) => definition.intervalMs));
  const graceMs = positiveInteger(options.graceMs) || Math.max(largestInterval * 4, 120000);
  const maxRepairs = Math.min(positiveInteger(options.maxRepairs) || DEFAULT_MAX_REPAIRS, DEFAULT_MAX_REPAIRS);
  const retryOptions = {
    attempts: options.retryAttempts,
    delayMs: options.retryDelayMs,
    sleep: options.sleep,
    logger: options.logger
  };

  const initialCounts = await readQueueState(queue, retryOptions);
  if (!queueIsIdle(initialCounts)) return { repaired: [], skipped: 'queue_not_idle' };

  const repeatableJobs = await readRepeatables(queue, retryOptions);
  const candidates = selectStaleDefinitions(repeatableJobs, allowlist, queueName, nowMs, graceMs, options);
  const repaired = [];
  const perDefinition = new Map();

  for (const definition of candidates) {
    if (repaired.length >= maxRepairs) break;
    const used = perDefinition.get(definition.name) || 0;
    if (used >= definition.maxRepairs) continue;

    const countsBeforeRemoval = await readQueueState(queue, { ...retryOptions, scheduleName: definition.name });
    if (!queueIsIdle(countsBeforeRemoval)) {
      safeLog(options.logger, 'repair_skipped_queue_changed', definition.name);
      break;
    }

    const freshRepeatables = await readRepeatables(queue, { ...retryOptions, scheduleName: definition.name });
    const freshMatches = freshRepeatables.filter((job) => isExactExpectedRepeatable(job, definition, queueName));
    if (freshMatches.length !== 1 || !isRepeatableStale(freshMatches[0], nowMs, graceMs, options)) {
      safeLog(options.logger, 'repair_skipped_metadata_changed', definition.name);
      continue;
    }

    const removed = await withBoundedRetry(
      () => queue.removeRepeatable(definition.name, definition.repeat, definition.jobId),
      { ...retryOptions, scheduleName: definition.name }
    );
    if (!removed) {
      safeLog(options.logger, 'repair_not_removed', definition.name);
      continue;
    }

    repaired.push(definition.name);
    perDefinition.set(definition.name, used + 1);
    safeLog(options.logger, 'repair_completed', definition.name);
  }

  return { repaired, skipped: null };
}

module.exports = {
  findMissingExpectedDefinitions,
  hasExpectedRepeatKeyShape,
  isExactExpectedRepeatable,
  isRepeatableStale,
  queueIsIdle,
  repairStaleRepeatables,
  sanitizeDefinitions,
  selectStaleDefinitions,
  withBoundedRetry
};
