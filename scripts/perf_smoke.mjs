#!/usr/bin/env node
import assert from 'node:assert/strict';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';
const username = process.env.ADMIN_USERNAME || 'admin.tu';
const password = process.env.ADMIN_PASSWORD;
const maxP95Ms = Number(process.env.PERF_MAX_P95_MS || '1500');

if (!password) {
  throw new Error('ADMIN_PASSWORD wajib diisi untuk perf smoke.');
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
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed ${response.status}: ${text}`);
  return data;
}

const samples = [];
const login = await timed('login', () => request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username, password })
}));
samples.push(login);
assert.ok(login.result.accessToken);

const auth = { authorization: `Bearer ${login.result.accessToken}` };
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

for (const [name, path] of endpoints) {
  samples.push(await timed(name, () => request(path, { headers: auth })));
}

const sorted = samples.map((item) => item.latencyMs).sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
const max = sorted.at(-1);
const avg = Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length);
const summary = {
  ok: p95 <= maxP95Ms,
  baseUrl,
  thresholdP95Ms: maxP95Ms,
  p95Ms: p95,
  avgMs: avg,
  maxMs: max,
  samples: samples.map(({ name, latencyMs }) => ({ name, latencyMs }))
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
