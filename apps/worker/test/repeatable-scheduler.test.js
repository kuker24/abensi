'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isRepeatableStale, shouldRepairRepeatables } = require('../src/repeatable-scheduler');

test('isRepeatableStale detects repeat metadata whose next run is beyond grace', () => {
  assert.equal(isRepeatableStale({ next: 1_000 }, 200_000, 120_000), true);
  assert.equal(isRepeatableStale({ next: 100_000 }, 200_000, 120_000), false);
  assert.equal(isRepeatableStale({ next: 0 }, 200_000, 120_000), false);
});

test('shouldRepairRepeatables repairs only expected stale jobs when queue is empty', () => {
  const definitions = [{ name: 'auto-missed', intervalMs: 15_000 }, { name: 'reconciliation', intervalMs: 30_000 }];
  const jobs = [
    { key: 'a', name: 'auto-missed', every: '15000', next: 1_000 },
    { key: 'b', name: 'reconciliation', every: '30000', next: 1_000 },
    { key: 'c', name: 'unrelated', every: '15000', next: 1_000 },
    { key: 'd', name: 'auto-missed', every: '99999', next: 1_000 }
  ];

  const stale = shouldRepairRepeatables(jobs, definitions, { waiting: 0, active: 0, delayed: 0 }, 200_000, 120_000);
  assert.deepEqual(stale.map((job) => job.key), ['a', 'b']);
});

test('shouldRepairRepeatables avoids repair while jobs are pending', () => {
  const definitions = [{ name: 'auto-missed', intervalMs: 15_000 }];
  const jobs = [{ key: 'a', name: 'auto-missed', every: '15000', next: 1_000 }];

  assert.deepEqual(shouldRepairRepeatables(jobs, definitions, { waiting: 0, active: 0, delayed: 1 }, 200_000, 120_000), []);
  assert.deepEqual(shouldRepairRepeatables(jobs, definitions, { waiting: 1, active: 0, delayed: 0 }, 200_000, 120_000), []);
});
