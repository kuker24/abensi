#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const username = process.env.ADMIN_USERNAME || 'admin.tu';
const password = process.env.ADMIN_PASSWORD;
const maxP95Ms = Number(process.env.PERF_MAX_P95_MS || '1500');
const maxEndpointMs = Number(process.env.PERF_MAX_ENDPOINT_MS || '2500');
const iterations = Number(process.env.PERF_ITERATIONS || '3');
const outPath = process.env.PERF_OUTPUT || 'artifacts/perf/perf-smoke.json';

if (!password) throw new Error('ADMIN_PASSWORD wajib diisi untuk perf smoke.');

let cookieHeader = '';
function mergeSetCookies(response) {
  const setCookie = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : [];
  const jar = new Map(cookieHeader.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...rest] = part.split('=');
    return [name, `${name}=${rest.join('=')}`];
  }));
  for (const cookie of setCookie) {
    const pair = cookie.split(';')[0];
    const [name] = pair.split('=');
    jar.set(name, pair);
  }
  cookieHeader = [...jar.values()].join('; ');
}

async function timed(name, fn) {
  const startedAt = performance.now();
  const result = await fn();
  const latencyMs = Math.round(performance.now() - startedAt);
  return { name, latencyMs, result };
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  mergeSetCookies(response);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed ${response.status}: ${text}`);
  return data;
}

async function text(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: cookieHeader ? { cookie: cookieHeader } : {} });
  const body = await response.text();
  if (!response.ok) throw new Error(`GET ${path} failed ${response.status}: ${body}`);
  return body;
}

const samples = [];
const login = await timed('login', () => request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username, password, expectedRole: 'admin' })
}));
samples.push(login);
assert.equal(login.result.user.username, username);
assert.match(cookieHeader, /schoolhub_access_token=/);

const endpoints = [
  ['health-ready', '/health/ready'],
  ['health-detail', '/health/detail'],
  ['dashboard', '/reports/dashboard'],
  ['trend', '/reports/trend?days=7'],
  ['live-monitor', '/reports/live-monitor?page=1&limit=20'],
  ['sessions', `/schedules/sessions?date=${new Date().toISOString().slice(0, 10)}&page=1&limit=20`],
  ['anomaly', '/reconciliation/flags?status=OPEN&page=1&limit=20'],
  ['notifications', '/notifications?page=1&limit=10']
];

for (let iteration = 0; iteration < iterations; iteration += 1) {
  for (const [name, path] of endpoints) {
    samples.push(await timed(`${name}#${iteration + 1}`, () => request(path)));
  }
}

const metrics = await text('/metrics');
const requiredMetrics = ['schoolhub_http_requests_total', 'schoolhub_http_errors_total', 'schoolhub_security_rejects_total', 'schoolhub_process_uptime_seconds'];
for (const metric of requiredMetrics) assert.match(metrics, new RegExp(`^${metric} `, 'm'));

const sorted = samples.map((item) => item.latencyMs).sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
const max = sorted.at(-1);
const avg = Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length);
const slow = samples.filter((item) => item.latencyMs > maxEndpointMs).map(({ name, latencyMs }) => ({ name, latencyMs }));
const summary = {
  ok: p95 <= maxP95Ms && slow.length === 0,
  baseUrl,
  thresholdP95Ms: maxP95Ms,
  thresholdEndpointMs: maxEndpointMs,
  iterations,
  p95Ms: p95,
  avgMs: avg,
  maxMs: max,
  slow,
  metrics: requiredMetrics,
  samples: samples.map(({ name, latencyMs }) => ({ name, latencyMs }))
};

mkdirSync(outPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
