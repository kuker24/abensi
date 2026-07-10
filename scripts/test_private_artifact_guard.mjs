#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const guard = join(root, 'scripts', 'private_artifact_guard.mjs');

function run(args) {
  return spawnSync(process.execPath, [guard, ...args], { cwd: root, encoding: 'utf8' });
}

const tempRoot = mkdtempSync(join(tmpdir(), 'private-artifact-guard-'));

function writePaths(name, paths) {
  const path = join(tempRoot, name);
  writeFileSync(path, `${paths.join('\0')}\0`, { mode: 0o600 });
  return path;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parse(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`guard output was not JSON: ${stdout}`);
  }
}

function expectSafe(paths, label) {
  const result = run(['--paths-file', writePaths(`${label}.paths`, paths)]);
  const parsed = parse(result.stdout);
  assert(result.status === 0, `${label} should exit 0`);
  assert(parsed.ok === true && parsed.blocked === 0, `${label} should be allowed`);
  assert(!parsed.policyIds?.length, `${label} should not report policies`);
}

function expectBlocked(paths, label, policyId) {
  const result = run(['--paths-file', writePaths(`${label}.paths`, paths)]);
  const parsed = parse(result.stdout);
  assert(result.status === 1, `${label} should exit 1`);
  assert(parsed.ok === false && parsed.blocked === paths.length, `${label} should be blocked`);
  assert(parsed.policyIds.includes(policyId), `${label} should report ${policyId}`);
  for (const path of paths) assert(!result.stdout.includes(path), `${label} leaked input path`);
}

try {
  expectSafe(['apps/web/src/assets/logo.svg', 'apps/web/public/fixtures/card-placeholder.jpeg'], 'legitimate-assets');
  expectSafe(['apps/api/test/fixtures/attendance-fixture.json'], 'legitimate-fixture');
  expectBlocked(['DataSekolah/synthetic-staff.xlsx'], 'staff-spreadsheet', 'private-staff-spreadsheet');
  expectBlocked(['DataSekolah/Absensi-Private-Reports/DataAkun/account-export.json'], 'account-export', 'private-account-export');
  expectBlocked(['DataSekolah/Absensi-Private-Reports/DataAkun/Cards/Synthetic Student.png'], 'named-card', 'named-card-export');
  expectBlocked(['DataSekolah/Absensi-Private-Reports/DataAkun/archive.zip'], 'private-archive', 'private-archive');
  expectBlocked(['DataSekolah/Absensi-Private-Reports/DataAkun/scan-evidence/records.tsv'], 'scan-evidence', 'scan-evidence');
  expectBlocked(['DataSekolah/Absensi-Private-Reports/summary.json'], 'private-report', 'private-report-tree');
  expectBlocked(['datasekolah\\absensi-private-reports\\dataakun\\synthetic.zip'], 'windows-separators', 'private-archive');
  expectBlocked(['DATASEKOLAH/ABSENSI-PRIVATE-REPORTS/DATAAKUN/SYNTHETIC.ZIP'], 'case-insensitive', 'private-archive');

  const traversal = run(['--paths-file', writePaths('traversal.paths', ['DataSekolah/../safe.txt'])]);
  const traversalResult = parse(traversal.stdout);
  assert(traversal.status === 2, 'traversal should exit 2');
  assert(traversalResult.ok === false && traversalResult.error, 'traversal should report invalid input');
  assert(!traversal.stdout.includes('DataSekolah/../safe.txt'), 'traversal leaked input path');

  const malformed = run(['--paths-file', writePaths('malformed.paths', ['apps/web/src/valid.txt'])]);
  const malformedResult = spawnSync(process.execPath, [guard, '--paths-file', join(tempRoot, 'missing.paths')], { encoding: 'utf8' });
  const invalidResult = parse(malformedResult.stdout);
  assert(malformed.status === 0, 'valid synthetic path should exit 0');
  assert(malformedResult.status === 2, 'missing paths file should exit 2');
  assert(invalidResult.ok === false && invalidResult.error, 'missing file should report invalid input');

  const directInput = join(tempRoot, 'direct.paths');
  writeFileSync(directInput, readFileSync(writePaths('direct-source.paths', ['apps/web/src/valid.txt'])), { mode: 0o600 });
  const direct = run(['--paths-file', directInput]);
  assert(direct.status === 0, 'direct null-delimited input should exit 0');

  console.log(JSON.stringify({ ok: true, cases: 15 }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'private artifact guard test failed');
  process.exitCode = 1;
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
