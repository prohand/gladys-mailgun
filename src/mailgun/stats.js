// -----------------------------------------------------------------------------
// Sending statistics of the domain, for the dashboard widget.
//
// Mailgun has two APIs for this: the Metrics API (current) and the Stats API
// (older, still answering on many accounts). The Metrics API is asked first;
// when the account does not have it (403/404) the Stats API answers instead.
// Both are turned into the same shape:
//   { totals: { accepted, delivered, failed, opened }, points: [{ t, ...same }] }
// The result is cached a few minutes: dashboards re-pull on every open.
// -----------------------------------------------------------------------------

import { MailgunError } from './errors.js';

/** The periods a widget instance can show. */
export const PERIODS = {
  '1d': { hours: 24, resolution: 'hour' },
  '7d': { hours: 24 * 7, resolution: 'day' },
  '30d': { hours: 24 * 30, resolution: 'day' },
};

export const DEFAULT_PERIOD = '7d';

const COUNTERS = ['accepted', 'delivered', 'failed', 'opened'];

/** How long a fetched result is reused, in ms. */
const CACHE_MS = 5 * 60 * 1000;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * RFC 2822 date, as Mailgun expects it: `Mon, 09 Nov 2026 00:00:00 +0000`.
 *
 * @param {Date} date
 * @returns {string}
 */
export function rfc2822(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${DAYS[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ` +
    `${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())} +0000`
  );
}

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isoTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Turn a Metrics API answer into the common shape. */
export function fromMetrics(answer) {
  const points = (answer?.items ?? [])
    .map((item) => {
      const time = (item.dimensions ?? []).find((dimension) => dimension.dimension === 'time');
      const t = isoTime(time?.value);
      const metrics = item.metrics ?? {};
      return t
        ? Object.fromEntries([
            ['t', t],
            ...COUNTERS.map((counter) => [counter, count(metrics[`${counter}_count`])]),
          ])
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.t.localeCompare(b.t));
  const aggregates = answer?.aggregates?.metrics;
  const totals = Object.fromEntries(
    COUNTERS.map((counter) => [
      counter,
      aggregates
        ? count(aggregates[`${counter}_count`])
        : points.reduce((sum, point) => sum + point[counter], 0),
    ]),
  );
  return { totals, points };
}

/** Turn a Stats API answer into the common shape. */
export function fromStats(answer) {
  const points = (answer?.stats ?? [])
    .map((entry) => {
      const t = isoTime(entry.time);
      if (!t) {
        return null;
      }
      const failed = entry.failed ?? {};
      return {
        t,
        accepted: count(entry.accepted?.total),
        delivered: count(entry.delivered?.total),
        failed:
          count(failed.permanent?.total) +
          count(failed.temporary?.total ?? failed.temporary?.espblock),
        opened: count(entry.opened?.total),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.t.localeCompare(b.t));
  const totals = Object.fromEntries(
    COUNTERS.map((counter) => [counter, points.reduce((sum, point) => sum + point[counter], 0)]),
  );
  return { totals, points };
}

/**
 * @param {object} [options]
 * @param {() => number} [options.now] clock, in ms
 */
export function createStatsReader({ now = Date.now } = {}) {
  const cache = new Map();

  async function fetchStats(client, periodKey) {
    const period = PERIODS[periodKey] ?? PERIODS[DEFAULT_PERIOD];
    const end = new Date(now());
    const start = new Date(end.getTime() - period.hours * 3600 * 1000);
    try {
      const answer = await client.metrics({
        start: rfc2822(start),
        end: rfc2822(end),
        resolution: period.resolution,
        dimensions: ['time'],
        metrics: COUNTERS.map((counter) => `${counter}_count`),
        filter: {
          AND: [
            {
              attribute: 'domain',
              comparator: '=',
              values: [{ label: client.domain, value: client.domain }],
            },
          ],
        },
        include_aggregates: true,
      });
      return fromMetrics(answer);
    } catch (err) {
      if (!(err instanceof MailgunError) || ![403, 404].includes(err.status)) {
        throw err;
      }
    }
    const answer = await client.statsTotal([
      ...COUNTERS.map((counter) => ['event', counter]),
      ['duration', periodKey === '1d' ? '24h' : periodKey],
      ['resolution', period.resolution],
    ]);
    return fromStats(answer);
  }

  return {
    /**
     * @param {ReturnType<import('./client.js').createMailgunClient>} client
     * @param {string} periodKey a key of {@link PERIODS}
     */
    async read(client, periodKey) {
      const key = `${client.region}:${client.domain}:${periodKey}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < CACHE_MS) {
        return hit.value;
      }
      const value = await fetchStats(client, periodKey);
      cache.set(key, { at: now(), value });
      return value;
    },

    /** Forget everything (configuration changed, or a refresh was asked). */
    clear() {
      cache.clear();
    },
  };
}
