#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const baseUrl = (process.env.BENCH_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1').replace(/\/$/, '');
const output = process.env.BENCH_OUTPUT || 'artifacts/perf/http-low-rate-benchmark.json';
const levels = (process.env.BENCH_CONCURRENCY_LEVELS || '1,5,10,25,50').split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0);
const stopP95Ms = Number(process.env.BENCH_STOP_P95_MS || '2500');
const endpoints = [
  ['health-live', '/health/live'],
  ['health-ready', '/health/ready'],
  ['html-root', '/'],
  ['manifest', '/site.webmanifest'],
  ['favicon', '/favicon.svg']
];

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)]);
}

async function request(path) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: 'follow',
      headers: { 'user-agent': 'siab2-low-rate-benchmark/1.0' }
    });
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { ok: false, status: 0, latencyMs: Math.round(performance.now() - started), error: String(error?.message || error).slice(0, 120) };
  }
}

async function runEndpoint([name, path], concurrency) {
  const total = concurrency === 1 ? 10 : concurrency;
  const samples = [];
  let inFlight = 0;
  let launched = 0;
  const started = performance.now();
  await new Promise((resolve) => {
    const launch = () => {
      while (inFlight < concurrency && launched < total) {
        launched += 1;
        inFlight += 1;
        request(path).then((sample) => samples.push(sample)).finally(() => {
          inFlight -= 1;
          if (launched >= total && inFlight === 0) resolve();
          else launch();
        });
      }
    };
    launch();
  });
  const durationMs = Math.max(1, Math.round(performance.now() - started));
  const latencies = samples.map((sample) => sample.latencyMs);
  const errors = samples.filter((sample) => !sample.ok).length;
  return {
    endpoint: name,
    path,
    concurrency,
    requests: samples.length,
    durationMs,
    throughputRps: Number((samples.length / (durationMs / 1000)).toFixed(2)),
    averageMs: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    maxMs: Math.max(...latencies),
    errorRate: Number((errors / samples.length).toFixed(4)),
    statuses: Object.fromEntries([...new Set(samples.map((sample) => sample.status))].map((status) => [status, samples.filter((sample) => sample.status === status).length]))
  };
}

const startedAt = new Date().toISOString();
const results = [];
let stoppedEarly = false;
for (const concurrency of levels) {
  for (const endpoint of endpoints) {
    const result = await runEndpoint(endpoint, concurrency);
    results.push(result);
    if (result.errorRate > 0 || result.p95Ms > stopP95Ms) {
      stoppedEarly = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (stoppedEarly) break;
}

const aggregate = {
  requests: results.reduce((sum, result) => sum + result.requests, 0),
  errors: results.reduce((sum, result) => sum + Math.round(result.errorRate * result.requests), 0),
  maxP95Ms: Math.max(...results.map((result) => result.p95Ms)),
  maxP99Ms: Math.max(...results.map((result) => result.p99Ms)),
  maxThroughputRpsSingleEndpoint: Math.max(...results.map((result) => result.throughputRps))
};
const report = {
  schemaVersion: 1,
  mode: 'low-rate-health-static',
  baseUrl,
  startedAt,
  finishedAt: new Date().toISOString(),
  concurrencyLevelsRequested: levels,
  stoppedEarly,
  safetyLimits: {
    noAuth: true,
    noMutations: true,
    perEndpointRequestsAtConcurrency1: 10,
    perEndpointRequestsAtHigherConcurrency: 'concurrency',
    stopIfAnyError: true,
    stopIfP95AboveMs: stopP95Ms
  },
  aggregate,
  results
};
mkdirSync(output.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(aggregate, null, 2));
if (aggregate.errors > 0 || stoppedEarly) process.exit(1);
