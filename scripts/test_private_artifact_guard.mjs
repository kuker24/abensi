#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const guard = join(root, 'scripts', 'private_artifact_guard.mjs');
const tempRoot = mkdtempSync(join(tmpdir(), 'private-artifact-guard-'));
let executedCases = 0;

function run(args) {
  return spawnSync(process.execPath, [guard, ...args], { cwd: root, encoding: 'utf8' });
}

function writeBuffer(name, buffer) {
  const path = join(tempRoot, name);
  writeFileSync(path, buffer, { mode: 0o600 });
  return path;
}

function writePaths(name, paths) {
  return writeBuffer(name, Buffer.from(`${paths.join('\0')}\0`, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parse(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error('guard output was not JSON');
  }
}

function assertNoLeak(stdout, values, label) {
  for (const value of values) {
    assert(!stdout.includes(value), `${label} leaked input`);
  }
}

function passCase() {
  executedCases += 1;
}

function expectSafe(paths, label) {
  const result = run(['--paths-file', writePaths(`${label}.paths`, paths)]);
  const parsed = parse(result.stdout);
  assert(result.status === 0, `${label} should exit 0`);
  assert(parsed.ok === true && parsed.blocked === 0, `${label} should be allowed`);
  assert(!parsed.policyIds?.length, `${label} should not report policies`);
  passCase();
}

function expectBlocked(paths, label, policyId) {
  const result = run(['--paths-file', writePaths(`${label}.paths`, paths)]);
  const parsed = parse(result.stdout);
  assert(result.status === 1, `${label} should exit 1`);
  assert(parsed.ok === false && parsed.blocked === paths.length, `${label} should be blocked`);
  assert(parsed.policyIds.includes(policyId), `${label} should report policy`);
  assertNoLeak(result.stdout, [tempRoot, ...paths], label);
  passCase();
}

function expectInvalidFile(buffer, label, expectedError, sensitiveValues = []) {
  const file = writeBuffer(`${label}.paths`, buffer);
  const result = run(['--paths-file', file]);
  const parsed = parse(result.stdout);
  assert(result.status === 2, `${label} should exit 2`);
  assert(parsed.ok === false && parsed.checked === 0 && parsed.blocked === 0, `${label} should fail safely`);
  assert(parsed.error === expectedError, `${label} should return generic error`);
  assertNoLeak(result.stdout, [tempRoot, file, ...sensitiveValues], label);
  passCase();
}

function expectInvalidInvocation(args, label, expectedError) {
  const result = run(args);
  const parsed = parse(result.stdout);
  assert(result.status === 2, `${label} should exit 2`);
  assert(parsed.ok === false && parsed.checked === 0 && parsed.blocked === 0, `${label} should fail safely`);
  assert(parsed.error === expectedError, `${label} should return generic error`);
  assertNoLeak(result.stdout, [tempRoot], label);
  passCase();
}

function expectInvalidPath(path, label) {
  expectInvalidFile(
    Buffer.from(`${path}\0`, 'utf8'),
    label,
    'absolute or empty path is not allowed',
    [path]
  );
}

try {
  expectSafe(['apps/api/src/main.ts'], 'legitimate-source');
  expectSafe(['apps/web/public/assets/synthetic-card-placeholder.jpeg'], 'legitimate-static-asset');
  expectSafe(['apps/api/test/fixtures/attendance-fixture.json'], 'legitimate-fixture');
  expectSafe(['apps/web/src/valid-null-delimited-input.ts'], 'valid-null-delimited-input');

  expectBlocked(['DataSekolah/synthetic-staff.xlsx'], 'staff-spreadsheet', 'private-staff-spreadsheet');
  expectBlocked(['DataSekolah/Absensi-Private-Reports/DataAkun/account-export.json'], 'account-export', 'private-account-export');
  expectBlocked(['DataSekolah/Absensi-Private-Reports/DataAkun/Cards/Synthetic Student.png'], 'named-card', 'named-card-export');
  expectBlocked(['DataSekolah/Absensi-Private-Reports/DataAkun/archive.zip'], 'private-archive', 'private-archive');
  expectBlocked(['DataSekolah/Absensi-Private-Reports/DataAkun/scan-evidence/records.tsv'], 'scan-evidence', 'scan-evidence');
  expectBlocked(['DataSekolah/Absensi-Private-Reports/summary.json'], 'private-report', 'private-report-tree');
  expectBlocked(['datasekolah\\absensi-private-reports\\dataakun\\synthetic.zip'], 'windows-separators', 'private-archive');
  expectBlocked(['DATASEKOLAH/ABSENSI-PRIVATE-REPORTS/DATAAKUN/SYNTHETIC.ZIP'], 'case-insensitive', 'private-archive');

  expectInvalidPath('/tmp/synthetic-output/report.xlsx', 'absolute-linux-path');
  expectInvalidPath('\\\\synthetic-server\\synthetic-share\\report.xlsx', 'unc-path');
  expectInvalidPath('C:\\synthetic-output\\report.xlsx', 'windows-drive-path');
  expectInvalidFile(
    Buffer.from('DataSekolah/../safe.txt\0', 'utf8'),
    'traversal-path',
    'malformed or traversal path is not allowed',
    ['DataSekolah/../safe.txt']
  );
  expectInvalidFile(
    Buffer.from('apps/web/src/example.ts', 'utf8'),
    'missing-final-nul',
    'input is not null-delimited',
    ['apps/web/src/example.ts']
  );
  expectInvalidFile(
    Buffer.from([0xc3, 0x28, 0x00]),
    'invalid-utf8',
    'input is not valid UTF-8'
  );
  expectInvalidFile(
    Buffer.concat([
      Buffer.from('apps/web/src/synthetic', 'utf8'),
      Buffer.from([0x01]),
      Buffer.from('file.ts\0', 'utf8')
    ]),
    'control-character-path',
    'malformed or traversal path is not allowed'
  );
  expectInvalidInvocation(
    ['--paths-file', join(tempRoot, 'missing.paths')],
    'missing-paths-file',
    'paths file could not be read'
  );

  console.log(JSON.stringify({ ok: true, cases: executedCases }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'private artifact guard test failed');
  process.exitCode = 1;
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
