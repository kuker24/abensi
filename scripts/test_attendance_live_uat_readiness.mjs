#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  boolEnv,
  evaluateDbReadiness,
  joinUrl,
  parsePsqlTsv,
  redactSensitive,
  ResultCollector,
  runAttendanceLiveUatReadiness
} from './attendance_live_uat_readiness.mjs';

const silent = { log() {}, error() {} };

assert.equal(boolEnv('true'), true);
assert.equal(boolEnv('1'), true);
assert.equal(boolEnv('no'), false);
assert.equal(joinUrl('https://example.test/', '/api/v1/attendance/policy'), 'https://example.test/api/v1/attendance/policy');

const redacted = redactSensitive('Cookie: schoolhub_access_token=abc AUTH_COOKIE_HEADER=raw schoolhub:qr:v1:QR_ABCDEFGHIJKL TOKEN=secret');
assert(!redacted.includes('abc'));
assert(!redacted.includes('raw'));
assert(!redacted.includes('QR_ABCDEFGHIJKL'));
assert(!redacted.includes('secret'));

const parsed = parsePsqlTsv('active_target_without_active_qr|0\nusers_by_role:SISWA|283\n');
assert.equal(parsed.get('active_target_without_active_qr'), 0);
assert.equal(parsed.get('users_by_role:SISWA'), 283);

const dbResults = new ResultCollector(silent);
evaluateDbReadiness(dbResults, parsePsqlTsv(`
active_target_without_active_qr|0
classes_without_active_enrollment|0
students_without_active_enrollment|0
active_student_without_nis|0
active_teacher_without_nip|0
attendance_policy_total|1
geofence_policies_total|1
device_readers_total|1
revoked_readers_total|0
active_readers_total|1
active_readers_with_secret|1
active_readers_with_hashed_key|1
android_releases_total|1
android_reader_versions_total|1
outbox_failed|0
outbox_pending|0
audit_entries_without_hash|9
student_attendance_total|0
gate_logs_total|0
prayer_logs_total|0
attendance_overrides_total|0
open_reconciliation_flags|0
`));
assert.equal(dbResults.hasFailures(), false);
assert.equal(dbResults.summary().WARN, 1);

const requested = [];
const fetchImpl = async (url, options = {}) => {
  requested.push({ url: String(url), headers: options.headers || {} });
  const protectedWithoutCookie = String(url).includes('/api/v1/') && !options.headers;
  const status = protectedWithoutCookie ? 401 : 200;
  return { status, body: { cancel: async () => {} } };
};

const files = new Map([
  ['/repo/apps/api/src/modules/attendance-gate/attendance-gate.controller.ts', "@Post('reader-scan')\n@Post('qr-reader-scan')\n@Controller('device/gate')\n@Capabilities('gateAttendance.record')\n@Capabilities('attendanceOverrides.create')\n@Capabilities('attendanceOverrides.approve')\n@Capabilities('attendanceOverrides.revoke')"],
  ['/repo/apps/api/src/modules/attendance-gate/attendance-gate.dto.ts', 'export class ReaderScanDto {\n  @IsString()\n  cardUid!\n}\nexport class QrReaderScanDto {\n  @IsString()\n  qrCode!\n}']
]);
const existsImpl = (path) => files.has(path);
const readFileImpl = async (path) => files.get(path);
const execFileImpl = async () => ({ stdout: '' });

const result = await runAttendanceLiveUatReadiness({
  env: { TARGET_BASE_URL: 'https://example.test', AUTH_COOKIE_HEADER: 'schoolhub_access_token=hidden' },
  fetchImpl,
  execFileImpl,
  output: silent,
  appDir: '/repo',
  readFileImpl,
  existsImpl
});
assert.equal(result.ok, true);
assert.equal(requested.some((item) => String(item.url).includes('reader-scan')), false);
assert.equal(requested.some((item) => String(item.url).includes('overrides')), false);
assert.equal(requested.some((item) => String(item.headers.Cookie || '').includes('hidden')), true);
assert.equal(result.results.some((item) => String(item.detail).includes('hidden')), false);

console.log('PASS attendance_live_uat_readiness.mjs helper self-test');
