#!/usr/bin/env node
/**
 * Read-only attendance live UAT readiness checks.
 *
 * Usage:
 *   npm run uat:attendance-live
 *   TARGET_BASE_URL=https://absensi.man1rokanhulu.cloud npm run uat:attendance-live
 *   ALLOW_DOCKER_READONLY=true npm run uat:attendance-live
 *   AUTH_COOKIE_HEADER='schoolhub_access_token=...' npm run uat:attendance-live
 *
 * Safety:
 * - Does not call scan, override, policy update, import, QR generation, password reset, or deploy endpoints.
 * - Does not log cookies, tokens, QR payloads, names, identifiers, or response bodies.
 * - Docker mode runs SELECT-only aggregate SQL and prints counts only.
 */
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCallback);
const DEFAULT_BASE_URL = 'https://absensi.man1rokanhulu.cloud';
const DEFAULT_TIMEOUT_MS = 15_000;

const PUBLIC_CHECKS = [
  { name: 'public web root reachable', path: '/', expectedStatuses: [200] },
  { name: 'public readiness reachable', path: '/health/ready', expectedStatuses: [200] },
  { name: 'attendance policy requires auth', path: '/api/v1/attendance/policy', expectedStatuses: [401, 403] },
  { name: 'gate logs require auth', path: '/api/v1/attendance/gate/logs?page=1&limit=1', expectedStatuses: [401, 403] },
  { name: 'prayer logs require auth', path: '/api/v1/attendance/prayer/logs?page=1&limit=1', expectedStatuses: [401, 403] },
  { name: 'reports dashboard requires auth', path: '/api/v1/reports/dashboard', expectedStatuses: [401, 403] }
];

const AUTH_READONLY_CHECKS = [
  { name: 'attendance policy read-only API', path: '/api/v1/attendance/policy', expectedStatuses: [200] },
  { name: 'gate logs read-only API', path: '/api/v1/attendance/gate/logs?page=1&limit=1', expectedStatuses: [200] },
  { name: 'prayer logs read-only API', path: '/api/v1/attendance/prayer/logs?page=1&limit=1', expectedStatuses: [200] },
  { name: 'reports dashboard read-only API', path: '/api/v1/reports/dashboard', expectedStatuses: [200] },
  { name: 'reports trend read-only API', path: '/api/v1/reports/trend?days=7', expectedStatuses: [200] },
  { name: 'academic classes read-only API', path: '/api/v1/academic/classes?page=1&limit=20', expectedStatuses: [200] }
];

const STATIC_CONTRACT_CHECKS = [
  {
    name: 'attendance reader endpoints stay isolated from browser auth controller',
    file: 'apps/api/src/modules/attendance-gate/attendance-gate.controller.ts',
    includes: ["@Post('reader-scan')", "@Post('qr-reader-scan')", "@Controller('device/gate')"],
    excludes: []
  },
  {
    name: 'attendance manual mutation endpoints remain capability guarded',
    file: 'apps/api/src/modules/attendance-gate/attendance-gate.controller.ts',
    includes: ["@Capabilities('gateAttendance.record')", "@Capabilities('attendanceOverrides.create')", "@Capabilities('attendanceOverrides.approve')", "@Capabilities('attendanceOverrides.revoke')"],
    excludes: []
  },
  {
    name: 'reader DTO does not require operator supplied userId',
    file: 'apps/api/src/modules/attendance-gate/attendance-gate.dto.ts',
    includes: ['export class ReaderScanDto', 'cardUid!', 'export class QrReaderScanDto', 'qrCode!'],
    excludes: ['ReaderScanDto {\n  @IsString()\n  userId']
  }
];

const READONLY_SQL = `
select 'users_by_role:' || role::text, count(*) from "User" group by role order by role::text;
select 'active_target_without_active_qr', count(*) from "User" u where u.active=true and u.role in ('SISWA','GURU_MAPEL') and not exists (select 1 from "QrCredential" q where q."userId"=u.id and q.status='ACTIVE');
select 'classes_without_active_enrollment', count(*) from "SchoolClass" c where not exists (select 1 from "ClassEnrollment" e where e."classId"=c.id and e.active=true and e."administrativeStatus"='ACTIVE');
select 'students_without_active_enrollment', count(*) from "User" u where u.active=true and u.role='SISWA' and not exists (select 1 from "ClassEnrollment" e where e."studentId"=u.id and e.active=true and e."administrativeStatus"='ACTIVE');
select 'active_student_without_nis', count(*) from "User" u where u.active=true and u.role='SISWA' and coalesce(nullif(trim(u."nis"),''),'')='';
select 'active_teacher_without_nip', count(*) from "User" u where u.active=true and u.role='GURU_MAPEL' and coalesce(nullif(trim(u."nip"),''),'')='';
select 'device_readers_total', count(*) from "DeviceReader";
select 'revoked_readers_total', count(*) from "DeviceReader" where status='REVOKED';
select 'active_readers_total', count(*) from "DeviceReader" where status='ACTIVE';
select 'active_readers_with_secret', count(*) from "DeviceReader" where status='ACTIVE' and "readerSecretCiphertext" is not null;
select 'active_readers_with_hashed_key', count(*) from "DeviceReader" where status='ACTIVE' and "apiKeyHash" is not null;
select 'android_releases_total', count(*) from "AndroidApkRelease";
select 'android_reader_versions_total', count(*) from "MobileAndroidReaderVersion";
select 'geofence_policies_total', count(*) from "GeofencePolicy";
select 'attendance_policy_total', count(*) from "AttendancePolicy";
select 'student_attendance_total', count(*) from "StudentAttendance";
select 'gate_logs_total', count(*) from "GateLog";
select 'prayer_logs_total', count(*) from "PrayerAttendanceLog";
select 'attendance_overrides_total', count(*) from "AttendanceOverride";
select 'open_reconciliation_flags', count(*) from "ReconciliationFlag" where status='OPEN';
select 'outbox_pending', count(*) from "OutboxEvent" where status='PENDING';
select 'outbox_failed', count(*) from "OutboxEvent" where status='FAILED';
select 'audit_entries_without_hash', count(*) from "AuditEntry" where "entryHash" is null or "prevHash" is null;
`.trim();

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
    .replace(/(AUTH_COOKIE_HEADER|ADMIN_PASSWORD|PASSWORD|TOKEN|SECRET|JWT)=([^\s&]+)/gi, '$1=[REDACTED]')
    .replace(/schoolhub:qr:v1:QR_[A-Z0-9_-]{10,64}/g, 'schoolhub:qr:v1:QR_[REDACTED]');
}

export class ResultCollector {
  constructor(output = console) {
    this.output = output;
    this.results = [];
  }

  add(status, name, detail = '') {
    const safeDetail = redactSensitive(detail);
    this.results.push({ status, name, detail: safeDetail });
    const line = `${status} ${name}${safeDetail ? ` — ${safeDetail}` : ''}`;
    if (status === 'FAIL') this.output.error(line);
    else this.output.log(line);
  }

  pass(name, detail = '') { this.add('PASS', name, detail); }
  fail(name, detail = '') { this.add('FAIL', name, detail); }
  warn(name, detail = '') { this.add('WARN', name, detail); }
  skip(name, detail = '') { this.add('SKIP', name, detail); }

  hasFailures() {
    return this.results.some((item) => item.status === 'FAIL');
  }

  summary() {
    return this.results.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 });
  }
}

function timeoutSignal(ms = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timeout) };
}

async function cancelBody(response) {
  try {
    if (response?.body && typeof response.body.cancel === 'function') await response.body.cancel();
  } catch {
    // Best effort only; never read or print response bodies in this script.
  }
}

async function fetchStatus(fetchImpl, url, options = {}) {
  const timeout = timeoutSignal(options.timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: timeout.signal });
    const status = response.status;
    await cancelBody(response);
    return status;
  } finally {
    timeout.done();
  }
}

async function runHttpChecks({ results, fetchImpl, baseUrl, checks, cookieHeader = '' }) {
  for (const check of checks) {
    try {
      const headers = cookieHeader ? { Cookie: cookieHeader } : undefined;
      const status = await fetchStatus(fetchImpl, joinUrl(baseUrl, check.path), { method: 'GET', headers });
      if (check.expectedStatuses.includes(status)) {
        results.pass(check.name, `status=${status}`);
      } else {
        results.fail(check.name, `expected=${check.expectedStatuses.join('/')} status=${status}`);
      }
    } catch (error) {
      results.fail(check.name, error instanceof Error ? error.message : String(error));
    }
  }
}

function fileExists(path, existsImpl = existsSync) {
  try { return existsImpl(path); } catch { return false; }
}

async function runStaticContractChecks({ results, appDir = process.cwd(), readFileImpl, existsImpl = existsSync }) {
  const { readFile } = readFileImpl ? { readFile: readFileImpl } : await import('node:fs/promises');
  for (const check of STATIC_CONTRACT_CHECKS) {
    const path = `${appDir.replace(/\/+$/, '')}/${check.file}`;
    if (!fileExists(path, existsImpl)) {
      results.skip(check.name, `missing ${check.file}`);
      continue;
    }
    try {
      const text = await readFile(path, 'utf8');
      const missing = check.includes.filter((needle) => !text.includes(needle));
      const forbidden = check.excludes.filter((needle) => text.includes(needle));
      if (missing.length === 0 && forbidden.length === 0) results.pass(check.name);
      else results.fail(check.name, `missing=${missing.length} forbidden=${forbidden.length}`);
    } catch (error) {
      results.fail(check.name, error instanceof Error ? error.message : String(error));
    }
  }
}

export function parsePsqlTsv(stdout) {
  const values = new Map();
  for (const rawLine of String(stdout || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.includes('|')) continue;
    const [name, rawValue] = line.split('|', 2);
    const value = Number(rawValue);
    values.set(name, Number.isFinite(value) ? value : rawValue);
  }
  return values;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function dockerReadonlyCommand({ composeFile, envFile }) {
  return `docker compose -f ${shellQuote(composeFile)} --env-file ${shellQuote(envFile)} exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' <<'SQL'\n${READONLY_SQL}\nSQL`;
}

async function runDockerReadonlyDbChecks({ results, env, execFileImpl = execFileAsync, appDir = process.cwd() }) {
  if (!boolEnv(env.ALLOW_DOCKER_READONLY)) {
    results.skip('read-only production DB aggregate checks', 'set ALLOW_DOCKER_READONLY=true on VPS app dir');
    return new Map();
  }

  const composeFile = env.PRODUCTION_COMPOSE_FILE || 'docker-compose.production.yml';
  const envFile = env.PRODUCTION_ENV_FILE || '/opt/schoolhub/.env';
  try {
    const { stdout } = await execFileImpl('bash', ['-lc', dockerReadonlyCommand({ composeFile, envFile })], {
      cwd: appDir,
      timeout: Number(env.DOCKER_READONLY_TIMEOUT_MS || 30_000),
      maxBuffer: 1024 * 1024
    });
    const values = parsePsqlTsv(stdout);
    evaluateDbReadiness(results, values, env);
    return values;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.fail('read-only production DB aggregate checks', message);
    return new Map();
  }
}

function numberValue(values, key) {
  const value = values.get(key);
  return typeof value === 'number' ? value : Number.NaN;
}

function expectZero(results, values, key, label) {
  const value = numberValue(values, key);
  if (value === 0) results.pass(label, `${key}=0`);
  else if (Number.isFinite(value)) results.fail(label, `${key}=${value}`);
  else results.fail(label, `${key}=missing`);
}

function expectAtLeast(results, values, key, min, label) {
  const value = numberValue(values, key);
  if (Number.isFinite(value) && value >= min) results.pass(label, `${key}=${value}`);
  else results.fail(label, `${key}=${Number.isFinite(value) ? value : 'missing'} min=${min}`);
}

export function evaluateDbReadiness(results, values, env = {}) {
  expectZero(results, values, 'active_target_without_active_qr', 'all active student/teacher targets have active QR');
  expectZero(results, values, 'classes_without_active_enrollment', 'all classes have active enrollment');
  expectZero(results, values, 'students_without_active_enrollment', 'all active students have active enrollment');
  expectZero(results, values, 'active_student_without_nis', 'all active students have NIS');
  expectZero(results, values, 'active_teacher_without_nip', 'all active teachers have NIP');
  expectAtLeast(results, values, 'attendance_policy_total', 1, 'attendance policy exists');
  expectAtLeast(results, values, 'geofence_policies_total', 1, 'geofence policy exists');
  expectAtLeast(results, values, 'active_readers_total', Number(env.MIN_ACTIVE_READERS || 1), 'active reader inventory exists');
  expectAtLeast(results, values, 'active_readers_with_secret', Number(env.MIN_ACTIVE_READERS_WITH_SECRET || 1), 'active readers have encrypted signing secret');
  expectAtLeast(results, values, 'active_readers_with_hashed_key', Number(env.MIN_ACTIVE_READERS_WITH_HASHED_KEY || 1), 'active readers have hashed API key');
  expectAtLeast(results, values, 'android_releases_total', 1, 'APK release inventory exists');
  expectAtLeast(results, values, 'android_reader_versions_total', 1, 'Android reader version inventory exists');
  expectZero(results, values, 'outbox_failed', 'outbox has no failed events');

  const outboxPending = numberValue(values, 'outbox_pending');
  if (outboxPending === 0) results.pass('outbox has no pending backlog', 'outbox_pending=0');
  else if (Number.isFinite(outboxPending)) results.warn('outbox pending backlog needs operator review', `outbox_pending=${outboxPending}`);
  else results.fail('outbox pending backlog count available', 'outbox_pending=missing');

  const auditWithoutHash = numberValue(values, 'audit_entries_without_hash');
  if (auditWithoutHash === 0) results.pass('audit chain has no un-hashed entries', 'audit_entries_without_hash=0');
  else if (Number.isFinite(auditWithoutHash)) results.warn('audit chain has legacy un-hashed entries', `audit_entries_without_hash=${auditWithoutHash}`);
  else results.fail('audit un-hashed entry count available', 'audit_entries_without_hash=missing');

  for (const key of ['device_readers_total', 'revoked_readers_total', 'student_attendance_total', 'gate_logs_total', 'prayer_logs_total', 'attendance_overrides_total', 'open_reconciliation_flags']) {
    const value = numberValue(values, key);
    if (Number.isFinite(value)) results.pass(`observed ${key}`, `${key}=${value}`);
    else results.fail(`observed ${key}`, `${key}=missing`);
  }
}

function writeJsonIfRequested(env, payload) {
  const outputJson = String(env.OUTPUT_JSON || '').trim();
  if (!outputJson) return;
  writeFileSync(outputJson, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function runAttendanceLiveUatReadiness({ env = process.env, fetchImpl = globalThis.fetch, execFileImpl = execFileAsync, output = console, appDir = process.cwd(), readFileImpl, existsImpl } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('global fetch is required (Node.js 18+).');
  const results = new ResultCollector(output);
  const baseUrl = String(env.TARGET_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const cookieHeader = String(env.AUTH_COOKIE_HEADER || '').trim();

  output.log(`Attendance live UAT readiness target: ${baseUrl}`);
  output.log('Mode: read-only; no scan/import/QR/password/deploy endpoints are called.');

  await runStaticContractChecks({ results, appDir, readFileImpl, existsImpl });
  await runHttpChecks({ results, fetchImpl, baseUrl, checks: PUBLIC_CHECKS });

  if (cookieHeader) await runHttpChecks({ results, fetchImpl, baseUrl, checks: AUTH_READONLY_CHECKS, cookieHeader });
  else results.skip('authenticated read-only attendance/report APIs', 'set AUTH_COOKIE_HEADER from an existing logged-in operator session; do not paste it in chat');

  const dbValues = await runDockerReadonlyDbChecks({ results, env, execFileImpl, appDir });
  results.pass('mutating attendance endpoints intentionally not called', 'reader-scan/qr-reader-scan/gate-tap/overrides/policy-update skipped');

  const summary = results.summary();
  const payload = {
    target: baseUrl,
    safety: {
      readOnly: true,
      mutatingEndpointsCalled: false,
      responseBodiesPrinted: false,
      qrPayloadsPrinted: false,
      secretsPrinted: false
    },
    summary,
    results: results.results,
    dbAggregates: Object.fromEntries(dbValues)
  };
  writeJsonIfRequested(env, payload);
  output.log(`Summary: PASS=${summary.PASS || 0} FAIL=${summary.FAIL || 0} WARN=${summary.WARN || 0} SKIP=${summary.SKIP || 0}`);
  return { ok: !results.hasFailures(), ...payload };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAttendanceLiveUatReadiness().then((result) => {
    process.exitCode = result.ok ? 0 : 1;
  }).catch((error) => {
    console.error(`FAIL attendance live UAT readiness crashed — ${redactSensitive(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
  });
}
