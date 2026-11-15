import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSendLimiter } from '../src/mailgun/limiter.js';
import { SendLimitError } from '../src/mailgun/errors.js';

test('refuses past the cap, counts recipients, frees up after an hour', () => {
  let now = 1_000_000_000;
  const limiter = createSendLimiter({ now: () => now });
  limiter.check(3, 2);
  limiter.record(2);
  assert.throws(() => limiter.check(3, 2), SendLimitError);
  limiter.check(3, 1);
  now += 61 * 60 * 1000;
  limiter.check(3, 3);
  assert.deepEqual(limiter.counts(), { lastHour: 0, lastDay: 2 });
});

test('keeps the history across a restart and forgets after a day', () => {
  let now = 1_000_000_000;
  const first = createSendLimiter({ now: () => now });
  first.record(2);
  const second = createSendLimiter({ history: first.history(), now: () => now });
  assert.throws(() => second.check(2), SendLimitError);
  now += 25 * 60 * 60 * 1000;
  assert.deepEqual(second.history(), []);
});
