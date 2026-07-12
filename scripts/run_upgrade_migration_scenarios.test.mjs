#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  isUpgradeMigrationScenarioRunnerEntrypoint,
  parseSanitizedVerifierOutput
} from './run_upgrade_migration_scenarios.mjs';

const valid = JSON.stringify({
  ok: false,
  status: 'FAIL',
  issueCodes: ['ENTRY_HASH_MISMATCH']
});

assert.equal(isUpgradeMigrationScenarioRunnerEntrypoint('/tmp/imported-test.mjs'), false);
assert.deepEqual(parseSanitizedVerifierOutput(valid), {
  ok: false,
  status: 'FAIL',
  issueCodes: ['ENTRY_HASH_MISMATCH']
});

for (const output of [
  '',
  'not-json',
  JSON.stringify({ ok: false, status: 'FAIL', issueCodes: ['OTHER_FAILURE'] }),
  JSON.stringify({ ok: false, status: 'ERROR', issueCodes: ['ENTRY_HASH_MISMATCH'] }),
  JSON.stringify({ ok: true, status: 'PASS', issueCodes: [] }),
  JSON.stringify({ status: 'FAIL', issueCodes: ['ENTRY_HASH_MISMATCH'] }),
  `${valid}\n${valid}`
]) {
  assert.throws(() => parseSanitizedVerifierOutput(output));
}

console.log('PASS run_upgrade_migration_scenarios.mjs sanitized verifier parser');
// Prisma imports in runner may retain runtime handles; parser self-test must terminate deterministically.
process.exit(0);
