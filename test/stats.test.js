import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailgunClient } from '../src/mailgun/client.js';
import { createStatsReader, fromMetrics, fromStats, rfc2822 } from '../src/mailgun/stats.js';
import { createFakeMailgun } from './helpers/fakeMailgun.js';

const METRICS = {
  items: [
    {
      dimensions: [{ dimension: 'time', value: 'Sun, 15 Nov 2026 00:00:00 +0000' }],
      metrics: { accepted_count: 4, delivered_count: 3, failed_count: 1, opened_count: 2 },
    },
    {
      dimensions: [{ dimension: 'time', value: 'Sat, 14 Nov 2026 00:00:00 +0000' }],
      metrics: { accepted_count: 1, delivered_count: 1, failed_count: 0, opened_count: 0 },
    },
  ],
  aggregates: {
    metrics: { accepted_count: 5, delivered_count: 4, failed_count: 1, opened_count: 2 },
  },
};

test('RFC 2822 dates as Mailgun reads them', () => {
  assert.equal(rfc2822(new Date('2026-11-09T07:05:03Z')), 'Mon, 09 Nov 2026 07:05:03 +0000');
});

test('Metrics API answers are sorted and totalled', () => {
  const result = fromMetrics(METRICS);
  assert.deepEqual(result.totals, { accepted: 5, delivered: 4, failed: 1, opened: 2 });
  assert.equal(result.points[0].t, '2026-11-14T00:00:00.000Z');
  assert.equal(result.points[1].delivered, 3);
});

test('Stats API answers give the same shape', () => {
  const result = fromStats({
    stats: [
      {
        time: 'Sun, 15 Nov 2026 00:00:00 UTC',
        accepted: { total: 3 },
        delivered: { total: 2 },
        failed: { permanent: { total: 1 }, temporary: { espblock: 1 } },
        opened: { total: 1 },
      },
    ],
  });
  assert.deepEqual(result.totals, { accepted: 3, delivered: 2, failed: 2, opened: 1 });
});

test('falls back to the Stats API when the account has no Metrics API, and caches', async () => {
  const fake = createFakeMailgun({ metrics: 403, stats: { stats: [] } });
  const client = createMailgunClient({
    apiKey: 'key-test',
    domain: 'mg.example.com',
    fetch: fake.fetch,
  });
  const reader = createStatsReader();
  await reader.read(client, '1d');
  const paths = fake.requests.map((request) => request.path);
  assert.deepEqual(paths, ['/v1/analytics/metrics', '/v3/mg.example.com/stats/total']);
  assert.ok(fake.requests[1].query.some(([key, value]) => key === 'duration' && value === '24h'));
  await reader.read(client, '1d');
  assert.equal(fake.requests.length, 2, 'served from the cache');
  reader.clear();
  await reader.read(client, '1d');
  assert.equal(fake.requests.length, 4);
});

test('the Metrics request filters on the domain', async () => {
  const fake = createFakeMailgun({ metrics: METRICS });
  const client = createMailgunClient({
    apiKey: 'key-test',
    domain: 'mg.example.com',
    fetch: fake.fetch,
  });
  const result = await createStatsReader().read(client, '7d');
  assert.equal(result.totals.accepted, 5);
  const { body } = fake.requests[0];
  assert.equal(body.resolution, 'day');
  assert.equal(body.filter.AND[0].values[0].value, 'mg.example.com');
});
