#!/usr/bin/env node
/**
 * Post-deploy smoke checks for SchoolHub production.
 *
 * Usage:
 *   TARGET_BASE_URL=https://absensi.man1rokanhulu.cloud npm run smoke:post-deploy
 *   TARGET_BASE_URL=https://absensi.man1rokanhulu.cloud ADMIN_USERNAME=... ADMIN_PASSWORD=... npm run smoke:post-deploy
 *   SKIP_AUTH_SMOKE=true npm run smoke:post-deploy
 *
 * Safety:
 * - Read-only checks by default.
 * - Never prints cookies, Authorization headers, passwords, tokens, or raw response bodies.
 * - Optional enum checks use docker compose only when explicitly requested by env.
 */

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const DEFAULT_BASE_URL = 'https://absensi.man1rokanhulu.cloud';
const DEFAULT_TIMEOUT_MS = 15_000;
const execFileAsync = promisify(execFileCallback);

export function boolEnv(value) {
  return /^(1|true|yes|y)$/i.test(String(value || '').trim());
}

export function joinUrl(baseUrl, path) {
  const base = String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const suffix = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
  return `${base}${suffix}`;
}

export function redactSensitive(value) {
  return String(value || '')
    .replace(/(Authorization\s*:\s*Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(Cookie\s*:\s*)[^\n\r]+/gi, '$1[REDACTED]')
    .replace(/(Set-Cookie\s*:\s*)[^\n\r]+/gi, '$1[REDACTED]')
    .replace(/(password|token|secret|jwt|cookie)=([^\s&]+)/gi, '$1=[REDACTED]')
    .replace(/("(?:password|token|secret|jwt|cookie|accessToken|refreshToken)"\s*:\s*")[^"]+("?)/gi, '$1[REDACTED]$2');
}

export class ResultCollector {
  constructor(output = console) {
    this.output = output;
    this.results = [];
  }

  pass(name, detail = '') {
    this.results.push({ status: 'PASS', name, detail });
    this.output.log(`PASS ${name}${detail ? ` — ${redactSensitive(detail)}` : ''}`);
  }

  fail(name, detail = '') {
    this.results.push({ status: 'FAIL', name, detail });
    this.output.error(`FAIL ${name}${detail ? ` — ${redactSensitive(detail)}` : ''}`);
  }

  skip(name, detail = '') {
    this.results.push({ status: 'SKIP', name, detail });
    this.output.log(`SKIP ${name}${detail ? ` — ${redactSensitive(detail)}` : ''}`);
  }

  hasFailures() {
    return this.results.some((item) => item.status === 'FAIL');
  }

  summary() {
    return this.results.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, { PASS: 0, FAIL: 0, SKIP: 0 });
  }
}

function requestTimeout(ms = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timeout) };
}

async function fetchSafe(fetchImpl, url, options = {}) {
  const timeout = requestTimeout(options.timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: timeout.signal });
  } finally {
    timeout.done();
  }
}

function setCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const combined = headers.get('set-cookie');
  if (!combined) return [];
  return combined.split(/,(?=\s*[^;,]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function cookieHeaderFromResponse(headers) {
  return setCookieHeaders(headers).map((cookie) => cookie.split(';')[0]).filter(Boolean).join('; ');
}

async function readText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function readJson(response) {
  const text = await readText(response);
  if (!text) return { ok: false, text, json: null, error: 'empty response body' };
  try {
    return { ok: true, text, json: JSON.parse(text), error: null };
  } catch (error) {
    return { ok: false, text, json: null, error: error instanceof Error ? error.message : 'invalid JSON' };
  }
}

async function expectStatusAndJson({ results, fetchImpl, baseUrl, path, name, expectedStatus = 200, cookieHeader = '' }) {
  const response = await fetchSafe(fetchImpl, joinUrl(baseUrl, path), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {})
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const parsed = await readJson(response);
  if (response.status !== expectedStatus) {
    results.fail(name, `HTTP ${response.status}, expected ${expectedStatus}`);
    if (parsed.text && /BigInt|serialize|Internal Server Error/i.test(parsed.text)) {
      results.fail(`${name} regression marker`, 'response looked like serialization/internal error');
    }
    return { response, parsed, ok: false };
  }
  if (!contentType.includes('application/json') || !parsed.ok) {
    results.fail(name, `expected JSON response; content-type=${contentType || 'missing'}`);
    return { response, parsed, ok: false };
  }
  results.pass(name, `HTTP ${response.status}`);
  return { response, parsed, ok: true };
}

async function publicChecks({ results, fetchImpl, baseUrl }) {
  const live = await expectStatusAndJson({ results, fetchImpl, baseUrl, path: '/api/v1/health/live', name: 'public API live health' });
  if (live.ok && live.parsed.json?.status !== 'ok') results.fail('public API live health status', 'status was not ok');
  else if (live.ok) results.pass('public API live health status ok');

  const ready = await expectStatusAndJson({ results, fetchImpl, baseUrl, path: '/api/v1/health/ready', name: 'public API ready health' });
  if (ready.ok && ready.parsed.json?.status !== 'ready') results.fail('public API ready health status', 'status was not ready');
  else if (ready.ok) results.pass('public API ready health status ready');

  const rootResponse = await fetchSafe(fetchImpl, joinUrl(baseUrl, '/'), { method: 'GET', headers: { accept: 'text/html' } });
  const rootText = await readText(rootResponse);
  if (rootResponse.status === 200) results.pass('public web root', 'HTTP 200');
  else results.fail('public web root', `HTTP ${rootResponse.status}, expected 200`);
  if (/<div[^>]+id=["']root["']/i.test(rootText)) results.pass('public web app shell root');
  else results.fail('public web app shell root', 'missing <div id="root"> marker');

  const auditResponse = await fetchSafe(fetchImpl, joinUrl(baseUrl, '/admin/audit'), { method: 'GET', headers: { accept: 'text/html' } });
  const auditText = await readText(auditResponse);
  if (auditResponse.status === 502) results.fail('admin audit SPA route', 'HTTP 502');
  else if (auditResponse.status === 200) results.pass('admin audit SPA route', 'HTTP 200');
  else results.fail('admin audit SPA route', `HTTP ${auditResponse.status}, expected 200 and not 502`);
  if (/<div[^>]+id=["']root["']/i.test(auditText)) results.pass('admin audit SPA shell');
  else results.fail('admin audit SPA shell', 'missing app shell marker');
}

async function login({ results, fetchImpl, baseUrl, username, password, label }) {
  const response = await fetchSafe(fetchImpl, joinUrl(baseUrl, '/api/v1/auth/login'), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, expectedRole: 'admin' })
  });
  const parsed = await readJson(response);
  if (![200, 201].includes(response.status) || !parsed.ok) {
    results.fail(`${label} login`, `HTTP ${response.status}`);
    return { ok: false, cookieHeader: '', user: null };
  }
  const cookieHeader = cookieHeaderFromResponse(response.headers);
  if (!cookieHeader.includes('schoolhub_access_token=')) {
    results.fail(`${label} login cookie`, 'access cookie missing');
    return { ok: false, cookieHeader: '', user: parsed.json?.user ?? null };
  }
  results.pass(`${label} login`, `HTTP ${response.status}`);
  return { ok: true, cookieHeader, user: parsed.json?.user ?? null };
}

async function authenticatedChecks({ results, fetchImpl, baseUrl, env }) {
  if (boolEnv(env.SKIP_AUTH_SMOKE)) {
    results.skip('authenticated smoke', 'SKIP_AUTH_SMOKE=true');
    return;
  }
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    results.skip('authenticated smoke', 'ADMIN_USERNAME/ADMIN_PASSWORD not provided');
    return;
  }

  const admin = await login({ results, fetchImpl, baseUrl, username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD, label: 'admin' });
  if (!admin.ok) return;

  const audit = await expectStatusAndJson({ results, fetchImpl, baseUrl, path: '/api/v1/audit?page=1&limit=1', name: 'authenticated audit API', cookieHeader: admin.cookieHeader });
  if (audit.ok) {
    if (Array.isArray(audit.parsed.json?.items)) results.pass('authenticated audit API items array');
    else results.fail('authenticated audit API items array', 'items is not an array');
    const firstSequence = audit.parsed.json?.items?.[0]?.sequence;
    if (firstSequence === undefined) results.skip('audit BigInt sequence serialization', 'audit list empty or sequence absent');
    else if (typeof firstSequence === 'string') results.pass('audit BigInt sequence serialization', 'sequence is string');
    else results.fail('audit BigInt sequence serialization', `sequence type ${typeof firstSequence}`);
  }

  await expectStatusAndJson({ results, fetchImpl, baseUrl, path: '/api/v1/device-readers?page=1&limit=5', name: 'authenticated device readers API', cookieHeader: admin.cookieHeader });
  await expectStatusAndJson({ results, fetchImpl, baseUrl, path: '/api/v1/reports/dashboard', name: 'authenticated dashboard report API', cookieHeader: admin.cookieHeader });
  await expectStatusAndJson({ results, fetchImpl, baseUrl, path: '/api/v1/reports/recap/classes?page=1&limit=1', name: 'authenticated school report preview API', cookieHeader: admin.cookieHeader });

  if (env.PRINCIPAL_USERNAME && env.PRINCIPAL_PASSWORD) {
    const principal = await login({ results, fetchImpl, baseUrl, username: env.PRINCIPAL_USERNAME, password: env.PRINCIPAL_PASSWORD, label: 'kepala sekolah' });
    if (principal.ok) {
      const response = await fetchSafe(fetchImpl, joinUrl(baseUrl, '/api/v1/reports/export?reportType=recap_classes&format=csv'), {
        method: 'GET',
        headers: { accept: '*/*', cookie: principal.cookieHeader }
      });
      await readText(response);
      if (response.status === 403) results.pass('kepala sekolah export denied', 'HTTP 403');
      else results.fail('kepala sekolah export denied', `HTTP ${response.status}, expected 403`);
    }
  } else {
    results.skip('kepala sekolah export denied', 'PRINCIPAL_USERNAME/PRINCIPAL_PASSWORD not provided');
  }
}

async function commandExists(command, execFileImpl) {
  try {
    await execFileImpl(command, ['--version'], { timeout: 5_000, maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function dockerPrismaEnumCheck({ enumName, memberName, execFileImpl = execFileAsync }) {
  const composeArgs = [
    'compose',
    '--env-file', '/opt/schoolhub/.env',
    '-f', 'docker-compose.production.yml',
    '-f', 'docker-compose.vps.yml',
    'exec', '-T', 'api',
    'node', '-e',
    `const { ${enumName} } = require('@prisma/client'); process.exit(${enumName} && ${enumName}.${memberName} ? 0 : 2);`
  ];
  await execFileImpl('docker', composeArgs, { timeout: 20_000, maxBuffer: 1024 * 1024 });
}

async function optionalEnumChecks({ results, env, execFileImpl = execFileAsync }) {
  const wantsRole = boolEnv(env.EXPECT_ROLE_KEPALA_SEKOLAH);
  const wantsAndroidMode = boolEnv(env.EXPECT_ANDROID_MODE_GERBANG);
  if (!wantsRole && !wantsAndroidMode) {
    results.skip('runtime Prisma enum checks', 'EXPECT_ROLE_KEPALA_SEKOLAH/EXPECT_ANDROID_MODE_GERBANG not set');
    return;
  }
  if (!(await commandExists('docker', execFileImpl))) {
    results.skip('runtime Prisma enum checks', 'docker compose unavailable; run on VPS app dir to enable');
    return;
  }

  if (wantsRole) {
    try {
      await dockerPrismaEnumCheck({ enumName: 'Role', memberName: 'KEPALA_SEKOLAH', execFileImpl });
      results.pass('runtime Prisma Role includes KEPALA_SEKOLAH');
    } catch (error) {
      results.fail('runtime Prisma Role includes KEPALA_SEKOLAH', error instanceof Error ? error.message : 'docker enum check failed');
    }
  }

  if (wantsAndroidMode) {
    try {
      await dockerPrismaEnumCheck({ enumName: 'AndroidReaderMode', memberName: 'GERBANG', execFileImpl });
      results.pass('runtime Prisma AndroidReaderMode includes GERBANG');
    } catch (error) {
      results.fail('runtime Prisma AndroidReaderMode includes GERBANG', error instanceof Error ? error.message : 'docker enum check failed');
    }
  }
}

export async function runSmoke({ env = process.env, fetchImpl = globalThis.fetch, execFileImpl = execFileAsync, output = console } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('global fetch is required (Node.js 18+).');
  const results = new ResultCollector(output);
  const baseUrl = String(env.TARGET_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  output.log(`Post-deploy smoke target: ${baseUrl}`);

  await publicChecks({ results, fetchImpl, baseUrl });
  await authenticatedChecks({ results, fetchImpl, baseUrl, env });
  await optionalEnumChecks({ results, env, execFileImpl });

  const summary = results.summary();
  output.log(`Summary: PASS=${summary.PASS || 0} FAIL=${summary.FAIL || 0} SKIP=${summary.SKIP || 0}`);
  return { ok: !results.hasFailures(), results: results.results, summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSmoke().then((result) => {
    process.exitCode = result.ok ? 0 : 1;
  }).catch((error) => {
    console.error(`FAIL smoke script crashed — ${redactSensitive(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
  });
}
