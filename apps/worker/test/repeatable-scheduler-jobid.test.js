'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isExactExpectedRepeatable } = require('../src/repeatable-scheduler');

test('repeat metadata with a different explicit job id is never accepted', () => {
  const definition = {
    queueName: 'schoolhub-worker',
    name: 'auto-missed',
    intervalMs: 15_000,
    jobId: 'repeat:auto-missed',
    maxRepairs: 1
  };
  const metadata = {
    key: 'repeat:auto-missed:0123456789abcdef',
    id: 'repeat:unrelated',
    name: 'auto-missed',
    every: '15000',
    next: 1_000
  };

  assert.equal(isExactExpectedRepeatable(metadata, definition, 'schoolhub-worker'), false);
});
