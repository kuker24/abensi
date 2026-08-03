'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { safeCustomJobId } = require('../src/job-id');

test('safeCustomJobId strips colon characters used by BullMQ repeat ids', () => {
  const jobId = safeCustomJobId(['dlq', 'reconciliation', 'repeat:6bd071a331682e5ba3132f6fa19ee0bb:1785743835838', 5]);
  assert.equal(jobId.includes(':'), false);
  assert.match(jobId, /^dlq_reconciliation_repeat_6bd071a331682e5ba3132f6fa19ee0bb_1785743835838_5$/);
});

test('safeCustomJobId collapses unsafe characters and bounds length', () => {
  const long = 'x'.repeat(200);
  const jobId = safeCustomJobId(['dlq', long], 40);
  assert.equal(jobId.includes(':'), false);
  assert.equal(jobId.length <= 40, true);
  assert.equal(safeCustomJobId(['  ', '::']), 'job');
});
