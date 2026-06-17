#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const artifactRoot = resolve(repoRoot, 'artifacts/upgrade-migrations');
const tmpRoot = resolve(repoRoot, '.tmp/upgrade-migrations');
const LEGACY_CUTOFF = '0020_user_must_change_password';

const scenarios = [
  {
    name: 'valid_legacy_happy_path',
    fixture: 'valid_legacy_happy_path.sql',
    expect: 'success',
    expectedPreflight: {},
    successAssertions: ['no_current_preflight_blockers', 'post_migration_verifier', 'audit_verify_chain', 'session_roster_fk_exists']
  },
  {
    name: 'gate_log_corrected_date_collision',
    fixture: 'gate_log_corrected_date_collision.sql',
    expect: 'success',
    expectedPreflight: { gate_log_corrected_date_collisions: 1 },
    successAssertions: ['gate_archive_one_duplicate']
  },
  {
    name: 'successful_archive_deduplication',
    fixture: 'successful_archive_deduplication.sql',
    expect: 'success',
    expectedPreflight: { gate_log_corrected_date_collisions: 1 },
    successAssertions: ['gate_archive_after_corrective_dedupe_and_historical_marker']
  },
  {
    name: 'archive_mismatch_expected_abort',
    fixture: 'archive_mismatch_expected_abort.sql',
    expect: 'post_assert_fail',
    expectedPreflight: { gate_log_corrected_date_collisions: 1 },
    failureAssertion: 'legacy_dedupe_without_archive'
  },
  {
    name: 'session_generated_date_collision',
    fixture: 'session_generated_date_collision.sql',
    expect: 'deploy_fail',
    expectedPreflight: { session_corrected_business_date_collisions: 1 },
    failureContains: 'Session businessDate correction would create'
  },
  {
    name: 'schedule_teacher_overlap_expected_abort',
    fixture: 'schedule_teacher_overlap_expected_abort.sql',
    expect: 'deploy_fail',
    expectedPreflight: { active_session_teacher_overlaps: 1 },
    failureContains: 'teacher schedule exclusion constraint'
  },
  {
    name: 'schedule_class_overlap_expected_abort',
    fixture: 'schedule_class_overlap_expected_abort.sql',
    expect: 'deploy_fail',
    expectedPreflight: { active_session_class_overlaps: 1 },
    failureContains: 'class schedule exclusion constraint'
  },
  {
    name: 'schedule_room_overlap_expected_abort',
    fixture: 'schedule_room_overlap_expected_abort.sql',
    expect: 'deploy_fail',
    expectedPreflight: { active_session_room_overlaps: 1 },
    failureContains: 'room schedule exclusion constraint'
  },
  {
    name: 'enrollment_overlap_expected_abort',
    fixture: 'enrollment_overlap_expected_abort.sql',
    expect: 'deploy_fail',
    expectedPreflight: { legacy_enrollment_effective_period_overlaps: 1 },
    failureContains: 'overlapping ClassEnrollment periods'
  },
  {
    name: 'audit_branch_expected_abort',
    fixture: 'audit_branch_expected_abort.sql',
    expect: 'deploy_fail',
    expectedPreflight: { audit_branch_points: 1 },
    failureContains: 'branch point'
  },
  {
    name: 'audit_orphan_expected_abort',
    fixture: 'audit_orphan_expected_abort.sql',
    expect: 'deploy_fail',
    expectedPreflight: { audit_orphans: 1 },
    failureContains: 'orphan'
  },
  {
    name: 'audit_cycle_expected_abort',
    fixture: 'audit_cycle_expected_abort.sql',
    expect: 'deploy_fail',
    expectedPreflight: { audit_genesis_count_invalid: 1 },
    failureContains: 'genesis'
  },
  {
    name: 'audit_payload_tamper_expected_abort',
    fixture: 'audit_payload_tamper_expected_abort.sql',
    expect: 'audit_verify_fail',
    expectedPreflight: {}
  },
  {
    name: 'audit_hash_tamper_expected_abort',
    fixture: 'audit_hash_tamper_expected_abort.sql',
    expect: 'audit_verify_fail',
    expectedPreflight: {}
  },
  {
    name: 'audit_stale_state_expected_abort',
    fixture: 'audit_stale_state_expected_abort.sql',
    expect: 'preflight_block',
    expectedPreflight: { audit_stale_chain_state: 1 }
  },
  {
    name: 'roster_gap_expected_abort',
    fixture: 'roster_gap_expected_abort.sql',
    expect: 'deploy_fail',
    expectedPreflight: { legacy_attendance_without_valid_student: 1 },
    failureContains: 'blocking roster/actor integrity'
  },
  {
    name: 'invalid_actor_fk_expected_abort',
    fixture: 'invalid_actor_fk_expected_abort.sql',
    expect: 'deploy_fail',
    expectedPreflight: { legacy_attendance_invalid_corrected_by: 1 },
    failureContains: 'blocking roster/actor integrity'
  }
];

function ensureSafeEnvironment() {
  if (process.env.CI !== 'true' && process.env.NODE_ENV !== 'test') {
    throw new Error('Refusing destructive upgrade migration scenarios unless CI=true or NODE_ENV=test.');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
}

function commandName(command, args) {
  return `${command} ${args.join(' ')}`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (!options.allowFailure && result.status !== 0) {
    const err = new Error(`Command failed (${result.status}): ${commandName(command, args)}\n${combined}`);
    err.output = combined;
    err.status = result.status;
    throw err;
  }
  return { status: result.status ?? 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '', output: combined };
}

function databaseUrlFor(dbName) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${dbName}`;
  url.search = '';
  return url.toString();
}

function adminDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function prepareLegacyPrismaDir(scenarioName) {
  const dir = join(tmpRoot, scenarioName, 'prisma');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'migrations'), { recursive: true });
  copyFileSync(join(repoRoot, 'prisma/schema.prisma'), join(dir, 'schema.prisma'));
  const migrations = readdirSync(join(repoRoot, 'prisma/migrations'))
    .filter((name) => name <= LEGACY_CUTOFF)
    .sort();
  for (const migration of migrations) {
    cpSync(join(repoRoot, 'prisma/migrations', migration), join(dir, 'migrations', migration), { recursive: true });
  }
  return join(dir, 'schema.prisma');
}

function assertFixtureIsReal(fixture) {
  const path = join(repoRoot, 'prisma/fixtures/upgrade', fixture);
  if (!existsSync(path)) throw new Error(`Missing fixture ${fixture}`);
  const content = readFileSync(path, 'utf8').trim();
  if (content.length < 200 || /^--[^]*\bSELECT\s+1\s*;?\s*$/i.test(content) || !/INSERT|UPDATE|ALTER/i.test(content)) {
    throw new Error(`Fixture ${fixture} is not a real populated SQL scenario.`);
  }
}

function parsePreflight(output) {
  const checks = {};
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [name, rawCount] = line.split('\t');
    const count = Number(rawCount);
    if (name && Number.isFinite(count)) checks[name] = count;
  }
  return checks;
}

function unexpectedPreflightCounts(checks, expected) {
  const mismatches = [];
  for (const [name, expectedCount] of Object.entries(expected)) {
    if ((checks[name] ?? 0) !== expectedCount) mismatches.push(`${name}: expected ${expectedCount}, got ${checks[name] ?? 0}`);
  }
  for (const [name, count] of Object.entries(checks)) {
    if (count > 0 && !(name in expected)) mismatches.push(`${name}: unexpected blocking count ${count}`);
  }
  return mismatches;
}

function queryScalar(dbUrl, sql) {
  const result = run('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql]);
  return result.stdout.trim();
}

function runNpmScript(script, dbUrl, extraArgs = [], allowFailure = false) {
  return run('npm', ['run', script, '--', ...extraArgs], {
    env: { DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
    allowFailure
  });
}

function assertSuccessAssertions(scenario, dbUrl) {
  const assertions = [];
  for (const assertion of scenario.successAssertions ?? []) {
    if (assertion === 'no_current_preflight_blockers') {
      const result = runNpmScript('preflight:production', dbUrl, [`--json=${join(artifactRoot, scenario.name, 'current-preflight.json')}`]);
      assertions.push({ name: assertion, ok: result.status === 0 });
    } else if (assertion === 'post_migration_verifier') {
      const result = runNpmScript('verify:post-migration', dbUrl, [`--json=${join(artifactRoot, scenario.name, 'post-migration.json')}`]);
      assertions.push({ name: assertion, ok: result.status === 0 });
    } else if (assertion === 'audit_verify_chain') {
      const result = runNpmScript('audit:verify-chain', dbUrl, []);
      assertions.push({ name: assertion, ok: result.status === 0 });
    } else if (assertion === 'session_roster_fk_exists') {
      const count = Number(queryScalar(dbUrl, `SELECT COUNT(*) FROM pg_constraint WHERE conname = 'StudentAttendance_session_roster_fkey'`));
      assertions.push({ name: assertion, ok: count === 1, detail: `count=${count}` });
    } else if (assertion === 'gate_archive_one_duplicate') {
      const archiveCount = Number(queryScalar(dbUrl, `SELECT COUNT(*) FROM "GateLogArchive" WHERE "migrationVersion" = '0026_correct_jakarta_business_dates'`));
      const retained = Number(queryScalar(dbUrl, `SELECT COUNT(*) FROM "GateLog" WHERE id IN ('gate_corrected_collision_a','gate_corrected_collision_b')`));
      assertions.push({ name: assertion, ok: archiveCount === 1 && retained === 1, detail: `archive=${archiveCount}, retained=${retained}` });
    } else if (assertion === 'gate_archive_after_corrective_dedupe_and_historical_marker') {
      const archiveCount = Number(queryScalar(dbUrl, `SELECT COUNT(*) FROM "GateLogArchive" WHERE "originalGateLogId" IN ('gate_archive_dup_1','gate_archive_dup_2')`));
      const historicalDedupe = Number(queryScalar(dbUrl, `SELECT COUNT(*) FROM "GateLogDeduplication" WHERE "duplicateGateLogId" IN ('gate_archive_dup_1','gate_archive_dup_2') AND "decision" = 'deleted_duplicate_before_business_date_unique_constraint'`));
      const retained = Number(queryScalar(dbUrl, `SELECT COUNT(*) FROM "GateLog" WHERE id IN ('gate_archive_canonical','gate_archive_dup_1','gate_archive_dup_2')`));
      assertions.push({ name: assertion, ok: archiveCount === 1 && historicalDedupe === 1 && retained === 1, detail: `archive=${archiveCount}, historicalDedupe=${historicalDedupe}, retained=${retained}` });
    } else {
      assertions.push({ name: assertion, ok: false, detail: 'unknown assertion' });
    }
  }
  return assertions;
}

function runFailureAssertion(scenario, dbUrl) {
  if (scenario.failureAssertion === 'legacy_dedupe_without_archive') {
    const mismatch = Number(queryScalar(dbUrl, `
      SELECT COUNT(*)
      FROM "GateLogDeduplication" d
      LEFT JOIN "GateLogArchive" a ON a."originalGateLogId" = d."duplicateGateLogId"
      WHERE d.decision = 'deleted_duplicate_before_business_date_unique_constraint'
        AND a.id IS NULL
    `));
    return { name: scenario.failureAssertion, ok: mismatch > 0, detail: `mismatch=${mismatch}` };
  }
  return { name: scenario.failureAssertion ?? 'none', ok: false, detail: 'unknown failure assertion' };
}

function createDatabase(dbName) {
  const adminUrl = adminDatabaseUrl();
  run('psql', [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${quoteIdent(dbName)} WITH (FORCE);`]);
  run('psql', [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${quoteIdent(dbName)};`]);
}

function dropDatabase(dbName) {
  try {
    run('psql', [adminDatabaseUrl(), '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${quoteIdent(dbName)} WITH (FORCE);`], { allowFailure: true });
  } catch {
    // best effort cleanup only
  }
}

function runScenario(scenario, index) {
  assertFixtureIsReal(scenario.fixture);
  const dbName = `schoolhub_up_${process.pid}_${index}`;
  const dbUrl = databaseUrlFor(dbName);
  const scenarioArtifactDir = join(artifactRoot, scenario.name);
  mkdirSync(scenarioArtifactDir, { recursive: true });
  const logs = [];
  const startedAt = new Date().toISOString();
  let ok = false;
  let stage = 'start';
  let preflightChecks = {};
  let deployResult = null;
  let verifyResult = null;
  let assertions = [];

  try {
    stage = 'create_database';
    createDatabase(dbName);

    stage = 'legacy_migrate_deploy';
    const legacySchema = prepareLegacyPrismaDir(scenario.name);
    const legacyDeploy = run('npx', ['prisma', 'migrate', 'deploy', '--schema', legacySchema], { env: { DATABASE_URL: dbUrl, DIRECT_URL: dbUrl } });
    logs.push({ stage, status: legacyDeploy.status, output: legacyDeploy.output });

    stage = 'load_fixture';
    const fixtureResult = run('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', join(repoRoot, 'prisma/fixtures/upgrade', scenario.fixture)]);
    logs.push({ stage, status: fixtureResult.status, output: fixtureResult.output });

    stage = 'read_only_preflight';
    const preflight = run('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-F', '\t', '-c', 'BEGIN TRANSACTION READ ONLY;', '-f', join(repoRoot, 'scripts/legacy_upgrade_preflight.sql'), '-c', 'COMMIT;']);
    logs.push({ stage, status: preflight.status, output: preflight.output });
    preflightChecks = parsePreflight(preflight.stdout);
    const preflightMismatches = unexpectedPreflightCounts(preflightChecks, scenario.expectedPreflight ?? {});
    if (preflightMismatches.length) {
      assertions.push({ name: 'expected_preflight_counts', ok: false, detail: preflightMismatches.join('; ') });
      throw new Error(`Preflight mismatch: ${preflightMismatches.join('; ')}`);
    }
    assertions.push({ name: 'expected_preflight_counts', ok: true, detail: JSON.stringify(preflightChecks) });

    if (scenario.expect === 'preflight_block') {
      ok = Object.values(preflightChecks).some((count) => count > 0);
      stage = 'preflight_block_expected';
      return { scenario: scenario.name, ok, expect: scenario.expect, stage, startedAt, finishedAt: new Date().toISOString(), database: dbName, preflightChecks, assertions, logs };
    }

    stage = 'full_migrate_deploy';
    deployResult = run('npx', ['prisma', 'migrate', 'deploy', '--schema', join(repoRoot, 'prisma/schema.prisma')], {
      env: { DATABASE_URL: dbUrl, DIRECT_URL: dbUrl },
      allowFailure: scenario.expect === 'deploy_fail'
    });
    logs.push({ stage, status: deployResult.status, output: deployResult.output });

    if (scenario.expect === 'deploy_fail') {
      const failed = deployResult.status !== 0;
      const contains = scenario.failureContains ? deployResult.output.includes(scenario.failureContains) : true;
      ok = failed && contains;
      assertions.push({ name: 'expected_deploy_failure', ok, detail: `failed=${failed}, contains=${contains}` });
      return { scenario: scenario.name, ok, expect: scenario.expect, stage, startedAt, finishedAt: new Date().toISOString(), database: dbName, preflightChecks, assertions, logs };
    }

    if (deployResult.status !== 0) throw new Error(`Unexpected full migration failure: ${deployResult.output}`);

    if (scenario.expect === 'audit_verify_fail') {
      stage = 'audit_verify_expected_failure';
      verifyResult = runNpmScript('audit:verify-chain', dbUrl, [], true);
      logs.push({ stage, status: verifyResult.status, output: verifyResult.output });
      ok = verifyResult.status !== 0 && verifyResult.output.includes('entryHash mismatch');
      assertions.push({ name: 'expected_audit_verification_failure', ok, detail: `status=${verifyResult.status}` });
      return { scenario: scenario.name, ok, expect: scenario.expect, stage, startedAt, finishedAt: new Date().toISOString(), database: dbName, preflightChecks, assertions, logs };
    }

    if (scenario.expect === 'post_assert_fail') {
      stage = 'post_assert_expected_failure';
      const failureAssertion = runFailureAssertion(scenario, dbUrl);
      assertions.push(failureAssertion);
      ok = failureAssertion.ok;
      return { scenario: scenario.name, ok, expect: scenario.expect, stage, startedAt, finishedAt: new Date().toISOString(), database: dbName, preflightChecks, assertions, logs };
    }

    stage = 'success_assertions';
    assertions.push(...assertSuccessAssertions(scenario, dbUrl));
    ok = assertions.every((assertion) => assertion.ok);
    return { scenario: scenario.name, ok, expect: scenario.expect, stage, startedAt, finishedAt: new Date().toISOString(), database: dbName, preflightChecks, assertions, logs };
  } catch (error) {
    logs.push({ stage, status: 'error', output: error instanceof Error ? error.stack ?? error.message : String(error) });
    return { scenario: scenario.name, ok: false, expect: scenario.expect, stage, startedAt, finishedAt: new Date().toISOString(), database: dbName, preflightChecks, assertions, error: error instanceof Error ? error.message : String(error), logs };
  } finally {
    const keep = process.env.UPGRADE_KEEP_DATABASES === 'true';
    if (!keep) dropDatabase(dbName);
  }
}

function main() {
  ensureSafeEnvironment();
  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });
  rmSync(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot, { recursive: true });

  const results = scenarios.map((scenario, index) => {
    console.log(`[upgrade] ${scenario.name}`);
    const result = runScenario(scenario, index + 1);
    const dir = join(artifactRoot, scenario.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'result.json'), `${JSON.stringify({ ...result, logs: undefined }, null, 2)}\n`);
    writeFileSync(join(dir, 'logs.json'), `${JSON.stringify(result.logs ?? [], null, 2)}\n`);
    console.log(`[upgrade] ${scenario.name}: ${result.ok ? 'PASS' : 'FAIL'} (${result.stage})`);
    return { ...result, logs: undefined };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    ok: results.every((result) => result.ok),
    scenarioCount: results.length,
    passCount: results.filter((result) => result.ok).length,
    failCount: results.filter((result) => !result.ok).length,
    legacyCutoff: LEGACY_CUTOFF,
    results
  };
  writeFileSync(join(artifactRoot, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main();
