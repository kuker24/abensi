#!/usr/bin/env node
import assert from 'node:assert/strict';
import { joinUrl, redactSensitive, ResultCollector } from './post_deploy_smoke.mjs';

const silent = { log() {}, error() {} };

assert.equal(joinUrl('https://example.test/', '/api/v1/health/live'), 'https://example.test/api/v1/health/live');
assert.equal(joinUrl('https://example.test', 'admin/audit'), 'https://example.test/admin/audit');

const redacted = redactSensitive('Authorization: Bearer abc.def Cookie: session=secret password=hunter2 token=raw');
assert(!redacted.includes('abc.def'));
assert(!redacted.includes('session=secret'));
assert(!redacted.includes('hunter2'));
assert(!redacted.includes('token=raw'));
assert(redacted.includes('[REDACTED]'));

const results = new ResultCollector(silent);
results.pass('ok');
results.skip('optional');
results.fail('bad', 'Cookie: hidden');
assert.equal(results.hasFailures(), true);
assert.deepEqual(results.summary(), { PASS: 1, FAIL: 1, SKIP: 1 });

console.log('PASS post_deploy_smoke.mjs helper self-test');
