'use strict';

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isExpectedRepeatable(job, definitions) {
  return definitions.some((definition) => job.name === definition.name && toNumber(job.every) === definition.intervalMs);
}

function isRepeatableStale(job, nowMs, graceMs) {
  const nextMs = toNumber(job.next, 0);
  return nextMs > 0 && nextMs + graceMs < nowMs;
}

function shouldRepairRepeatables(repeatableJobs, definitions, counts, nowMs, graceMs) {
  const pendingJobs = Number(counts.waiting || 0) + Number(counts.active || 0) + Number(counts.delayed || 0);
  if (pendingJobs > 0) return [];
  return repeatableJobs.filter((job) => isExpectedRepeatable(job, definitions) && isRepeatableStale(job, nowMs, graceMs));
}

async function repairStaleRepeatables(queue, definitions, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const maxIntervalMs = Math.max(...definitions.map((job) => job.intervalMs));
  const graceMs = Number(options.graceMs || Math.max(maxIntervalMs * 4, 120000));
  const [repeatableJobs, counts] = await Promise.all([
    queue.getRepeatableJobs(),
    queue.getJobCounts('waiting', 'active', 'delayed')
  ]);
  const staleJobs = shouldRepairRepeatables(repeatableJobs, definitions, counts, nowMs, graceMs);
  for (const job of staleJobs) {
    await queue.removeRepeatableByKey(job.key);
  }
  return staleJobs;
}

module.exports = {
  isRepeatableStale,
  shouldRepairRepeatables,
  repairStaleRepeatables
};
