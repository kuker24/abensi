'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findMissingExpectedDefinitions,
  hasExpectedRepeatKeyShape,
  isExactExpectedRepeatable,
  isRepeatableStale,
  queueIsIdle,
  repairStaleRepeatables,
  sanitizeDefinitions,
  selectStaleDefinitions,
  withBoundedRetry
} = require('../src/repeatable-scheduler');

const QUEUE_NAME = 'schoolhub-worker';
const NOW = 200_000;
const GRACE = 120_000;

function definition(name = 'auto-missed', intervalMs = 15_000, overrides = {}) {
  return {
    queueName: QUEUE_NAME,
    name,
    intervalMs,
    jobId: `repeat:${name}`,
    maxRepairs: 1,
    ...overrides
  };
}

function repeatable(definitionValue, overrides = {}) {
  return {
    key: `repeat:${definitionValue.name}:0123456789abcdef`,
    name: definitionValue.name,
    every: String(definitionValue.intervalMs),
    next: 1_000,
    ...overrides
  };
}

function makeQueue(options = {}) {
  const counts = options.counts || [{ waiting: 0, active: 0, delayed: 0 }];
  const repeatables = options.repeatables || [[]];
  let countIndex = 0;
  let repeatIndex = 0;
  const calls = { remove: [], counts: 0, repeatables: 0 };
  return {
    name: QUEUE_NAME,
    calls,
    async getJobCounts() {
      calls.counts += 1;
      const value = counts[Math.min(countIndex, counts.length - 1)];
      countIndex += 1;
      if (value instanceof Error) throw value;
      return value;
    },
    async getRepeatableJobs() {
      calls.repeatables += 1;
      const value = repeatables[Math.min(repeatIndex, repeatables.length - 1)];
      repeatIndex += 1;
      if (value instanceof Error) throw value;
      return value;
    },
    async removeRepeatable(name, repeat, jobId) {
      calls.remove.push({ name, repeat, jobId });
      return options.removeResult ?? true;
    }
  };
}

const noSleep = async () => {};

test('allowlist requires exact queue, exact safe name, exact job id, interval, and bounded repair count', () => {
  const valid = sanitizeDefinitions([definition()], QUEUE_NAME);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].queueName, QUEUE_NAME);
  assert.deepEqual(valid[0].repeat, { every: 15_000, immediately: true });

  assert.deepEqual(sanitizeDefinitions([], QUEUE_NAME), []);
  assert.deepEqual(sanitizeDefinitions([definition('auto-missed', 15_000, { queueName: 'other' })], QUEUE_NAME), []);
  assert.deepEqual(sanitizeDefinitions([definition('Auto Missed')], QUEUE_NAME), []);
  assert.deepEqual(sanitizeDefinitions([definition('auto-missed', 15_000, { jobId: 'repeat:other' })], QUEUE_NAME), []);
  assert.deepEqual(sanitizeDefinitions([definition('auto-missed', 1_000)], QUEUE_NAME), []);
  assert.deepEqual(sanitizeDefinitions([definition('auto-missed', 15_000, { maxRepairs: 3 })], QUEUE_NAME), []);
});

test('BullMQ repeat metadata key shape is bounded and rejects unsafe raw keys', () => {
  assert.equal(hasExpectedRepeatKeyShape('repeat:auto-missed:0123456789abcdef'), true);
  assert.equal(hasExpectedRepeatKeyShape('repeat:auto missed:secret'), false);
  assert.equal(hasExpectedRepeatKeyShape('../redis:key'), false);
  assert.equal(hasExpectedRepeatKeyShape('x'.repeat(513)), false);
  assert.equal(hasExpectedRepeatKeyShape(''), false);
});

test('exact repeat matching enforces queue, name, interval, non-cron metadata, and safe key', () => {
  const def = definition();
  assert.equal(isExactExpectedRepeatable(repeatable(def), def, QUEUE_NAME), true);
  assert.equal(isExactExpectedRepeatable(repeatable(def), def, 'other-queue'), false);
  assert.equal(isExactExpectedRepeatable(repeatable(def, { name: 'auto-missed-copy' }), def, QUEUE_NAME), false);
  assert.equal(isExactExpectedRepeatable(repeatable(def, { every: '30000' }), def, QUEUE_NAME), false);
  assert.equal(isExactExpectedRepeatable(repeatable(def, { pattern: '* * * * *' }), def, QUEUE_NAME), false);
  assert.equal(isExactExpectedRepeatable(repeatable(def, { key: 'unsafe key' }), def, QUEUE_NAME), false);
});

test('staleness accepts only finite reasonable timestamps beyond grace', () => {
  assert.equal(isRepeatableStale({ next: 1_000 }, NOW, GRACE), true);
  assert.equal(isRepeatableStale({ next: 100_000 }, NOW, GRACE), false);
  assert.equal(isRepeatableStale({ next: 0 }, NOW, GRACE), false);
  assert.equal(isRepeatableStale({ next: 'not-a-number' }, NOW, GRACE), false);
  assert.equal(isRepeatableStale({ next: NOW + 31 * 24 * 60 * 60 * 1000 }, NOW, GRACE), false);
  assert.equal(isRepeatableStale({ next: NOW - 31 * 24 * 60 * 60 * 1000 }, NOW, GRACE), false);
});

test('stale selection ignores unrelated, similar-name, wrong-interval, malformed, future, and duplicate metadata', () => {
  const auto = definition();
  const reconciliation = definition('reconciliation', 30_000);
  const jobs = [
    repeatable(auto),
    repeatable(reconciliation, { next: 199_000 }),
    repeatable(auto, { name: 'auto-missed-copy' }),
    repeatable(auto, { every: 99_999 }),
    repeatable(auto, { key: 'unsafe key' })
  ];
  const selected = selectStaleDefinitions(jobs, [auto, reconciliation], QUEUE_NAME, NOW, GRACE);
  assert.deepEqual(selected.map((item) => item.name), ['auto-missed']);

  const duplicate = selectStaleDefinitions([repeatable(auto), repeatable(auto, { key: 'repeat:auto-missed:second' })], [auto], QUEUE_NAME, NOW, GRACE);
  assert.deepEqual(duplicate, []);
});

test('queue idle check fails closed for waiting, active, delayed, negative, or malformed counts', () => {
  assert.equal(queueIsIdle({ waiting: 0, active: 0, delayed: 0 }), true);
  assert.equal(queueIsIdle({ waiting: 1, active: 0, delayed: 0 }), false);
  assert.equal(queueIsIdle({ waiting: 0, active: 1, delayed: 0 }), false);
  assert.equal(queueIsIdle({ waiting: 0, active: 0, delayed: 1 }), false);
  assert.equal(queueIsIdle({ waiting: -1, active: 0, delayed: 0 }), false);
  assert.equal(queueIsIdle({ waiting: 'bad', active: 0, delayed: 0 }), false);
});

test('repair removes only an exact allowlisted stale schedule without passing a raw Redis key', async () => {
  const def = definition();
  const stale = repeatable(def, { key: 'repeat:auto-missed:do-not-pass-this-key' });
  const queue = makeQueue({
    counts: [
      { waiting: 0, active: 0, delayed: 0 },
      { waiting: 0, active: 0, delayed: 0 }
    ],
    repeatables: [[stale], [stale]]
  });

  const result = await repairStaleRepeatables(queue, [def], {
    queueName: QUEUE_NAME,
    nowMs: NOW,
    graceMs: GRACE,
    sleep: noSleep
  });

  assert.deepEqual(result.repaired, ['auto-missed']);
  assert.deepEqual(queue.calls.remove, [{
    name: 'auto-missed',
    repeat: { every: 15_000, immediately: true },
    jobId: 'repeat:auto-missed'
  }]);
  assert.equal(JSON.stringify(queue.calls.remove).includes(stale.key), false);
});

test('repair is skipped whenever initial queue state has pending work', async () => {
  for (const counts of [
    { waiting: 1, active: 0, delayed: 0 },
    { waiting: 0, active: 1, delayed: 0 },
    { waiting: 0, active: 0, delayed: 1 }
  ]) {
    const def = definition();
    const queue = makeQueue({ counts: [counts], repeatables: [[repeatable(def)]] });
    const result = await repairStaleRepeatables(queue, [def], { queueName: QUEUE_NAME, nowMs: NOW, graceMs: GRACE, sleep: noSleep });
    assert.deepEqual(result.repaired, []);
    assert.equal(result.skipped, 'queue_not_idle');
    assert.equal(queue.calls.remove.length, 0);
  }
});

test('state change immediately before deletion prevents repair', async () => {
  const def = definition();
  const stale = repeatable(def);
  const queue = makeQueue({
    counts: [
      { waiting: 0, active: 0, delayed: 0 },
      { waiting: 1, active: 0, delayed: 0 }
    ],
    repeatables: [[stale], [stale]]
  });
  const events = [];
  const result = await repairStaleRepeatables(queue, [def], {
    queueName: QUEUE_NAME,
    nowMs: NOW,
    graceMs: GRACE,
    sleep: noSleep,
    logger: (event) => events.push(event)
  });
  assert.deepEqual(result.repaired, []);
  assert.equal(queue.calls.remove.length, 0);
  assert.equal(events.some((event) => event.event === 'repair_skipped_queue_changed'), true);
});

test('metadata change immediately before deletion prevents repair', async () => {
  const def = definition();
  const queue = makeQueue({
    counts: [
      { waiting: 0, active: 0, delayed: 0 },
      { waiting: 0, active: 0, delayed: 0 }
    ],
    repeatables: [[repeatable(def)], [repeatable(def, { every: 30_000 })]]
  });
  const result = await repairStaleRepeatables(queue, [def], { queueName: QUEUE_NAME, nowMs: NOW, graceMs: GRACE, sleep: noSleep });
  assert.deepEqual(result.repaired, []);
  assert.equal(queue.calls.remove.length, 0);
});

test('repair count is globally bounded and per-definition bounded', async () => {
  const auto = definition();
  const reconciliation = definition('reconciliation', 30_000);
  const initial = [repeatable(auto), repeatable(reconciliation)];
  const queue = makeQueue({
    counts: [
      { waiting: 0, active: 0, delayed: 0 },
      { waiting: 0, active: 0, delayed: 0 },
      { waiting: 0, active: 0, delayed: 0 }
    ],
    repeatables: [initial, initial, initial]
  });
  const result = await repairStaleRepeatables(queue, [auto, reconciliation], {
    queueName: QUEUE_NAME,
    nowMs: NOW,
    graceMs: GRACE,
    maxRepairs: 1,
    sleep: noSleep
  });
  assert.equal(result.repaired.length, 1);
  assert.equal(queue.calls.remove.length, 1);
});

test('remove false is safe and does not claim a completed repair', async () => {
  const def = definition();
  const stale = repeatable(def);
  const queue = makeQueue({
    counts: [{ waiting: 0, active: 0, delayed: 0 }, { waiting: 0, active: 0, delayed: 0 }],
    repeatables: [[stale], [stale]],
    removeResult: false
  });
  const result = await repairStaleRepeatables(queue, [def], { queueName: QUEUE_NAME, nowMs: NOW, graceMs: GRACE, sleep: noSleep });
  assert.deepEqual(result.repaired, []);
});

test('empty or invalid allowlist performs no Redis operations and does not crash', async () => {
  const queue = makeQueue();
  const empty = await repairStaleRepeatables(queue, [], { queueName: QUEUE_NAME, sleep: noSleep });
  assert.deepEqual(empty, { repaired: [], skipped: 'invalid_or_empty_allowlist' });
  assert.equal(queue.calls.counts, 0);
  assert.equal(queue.calls.repeatables, 0);

  const invalid = await repairStaleRepeatables(queue, [definition('auto-missed', 15_000, { queueName: 'wrong' })], { queueName: QUEUE_NAME, sleep: noSleep });
  assert.deepEqual(invalid, { repaired: [], skipped: 'invalid_or_empty_allowlist' });
});

test('bounded retry recovers transient failure without logging raw error content', async () => {
  let attempts = 0;
  const events = [];
  const result = await withBoundedRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('redis://user:secret@example.invalid sensitive');
    return 'ok';
  }, {
    attempts: 3,
    delayMs: 1,
    sleep: noSleep,
    scheduleName: 'auto-missed',
    logger: (event) => events.push(event)
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
  assert.equal(JSON.stringify(events).includes('secret'), false);
  assert.deepEqual(events.map((event) => event.attempt), [1, 2]);
});

test('bounded retry stops after three attempts and does not loop destructively', async () => {
  let attempts = 0;
  await assert.rejects(
    withBoundedRetry(async () => {
      attempts += 1;
      throw new Error('redis unavailable');
    }, { attempts: 99, delayMs: 1, sleep: noSleep }),
    /redis unavailable/
  );
  assert.equal(attempts, 3);
});

test('missing schedule detection recreates only absent exact definitions and is idempotent', () => {
  const auto = definition();
  const reconciliation = definition('reconciliation', 30_000);
  assert.deepEqual(
    findMissingExpectedDefinitions([repeatable(auto), repeatable(reconciliation)], [auto, reconciliation], QUEUE_NAME),
    []
  );
  assert.deepEqual(
    findMissingExpectedDefinitions([repeatable(auto)], [auto, reconciliation], QUEUE_NAME).map((item) => item.name),
    ['reconciliation']
  );
  assert.deepEqual(
    findMissingExpectedDefinitions([repeatable(auto), repeatable(auto, { key: 'repeat:auto-missed:duplicate' })], [auto], QUEUE_NAME),
    []
  );
});
