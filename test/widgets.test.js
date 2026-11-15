import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { MailgunError } from '../src/mailgun/errors.js';
import {
  WIDGET_ACTIONS,
  buildActivityWidget,
  buildEventsWidget,
} from '../src/capabilities/widgets.js';
import { WEBHOOK_KEY } from '../src/app.js';
import { CONFIG, PLUS_URL, startApp } from './helpers/app.js';
import { mailgunEvent } from './helpers/signing.js';

const config = normalizeConfig(CONFIG);
const STATS = {
  totals: { accepted: 12, delivered: 10, failed: 2, opened: 5 },
  points: [
    { t: '2026-11-14T00:00:00.000Z', accepted: 5, delivered: 4, failed: 1, opened: 2 },
    { t: '2026-11-15T00:00:00.000Z', accepted: 7, delivered: 6, failed: 1, opened: 3 },
  ],
};
const DOMAIN = { state: 'active' };
const PLUS = { available: true, registered: true };

function event(name, extra = {}) {
  return {
    id: `id-${name}`,
    event: name,
    at: '2026-11-15T10:00:00.000Z',
    recipient: 'alice@example.org',
    subject: 'Door opened',
    reason: '',
    url: '',
    ...extra,
  };
}

test('every activity content is rendered exactly as sent', () => {
  const contents = [
    buildActivityWidget({ config: normalizeConfig({}) }),
    buildActivityWidget({ config, stats: STATS, domain: DOMAIN, webhooks: PLUS }),
    buildActivityWidget({ config, settings: { period: '1d' }, stats: STATS, domain: DOMAIN }),
    buildActivityWidget({
      config,
      statsError: new MailgunError(401, 'Forbidden'),
      domain: { state: null },
    }),
    buildActivityWidget({
      config: normalizeConfig({ ...CONFIG, webhook_signing_key: 'k', max_emails_per_hour: 1 }),
      stats: { totals: STATS.totals, points: [] },
      domain: { state: 'unverified' },
      webhooks: { available: true, registered: false, error: new Error('x') },
      counts: { lastHour: 1, lastDay: 3 },
    }),
  ];
  for (const content of contents) {
    assert.deepEqual(validateWidgetContent(content), []);
  }
});

test('the activity widget shows the figures, the chart and both buttons', () => {
  const content = buildActivityWidget({ config, stats: STATS, domain: DOMAIN, webhooks: PLUS });
  const types = content.components.map((component) => component.type);
  assert.deepEqual(types, [
    'value',
    'value',
    'value',
    'value',
    'chart',
    'status',
    'button',
    'button',
  ]);
  assert.equal(content.components[2].value, 2);
  const actions = content.components.filter((c) => c.action).map((c) => c.action.key);
  assert.deepEqual(actions.sort(), Object.values(WIDGET_ACTIONS).sort());
});

test('every events content is rendered exactly as sent', () => {
  const events = [
    event('delivered'),
    event('failed', { reason: '550 No such mailbox' }),
    event('clicked', { url: 'https://gladysassistant.com/a-very-long-path' }),
    event('opened', { subject: '' }),
    event('complained'),
    event('unsubscribed'),
    event('mystery'),
    event('opened', { subject: 'x'.repeat(300) }),
    event('opened'),
  ];
  const contents = [
    buildEventsWidget({ config, events }),
    buildEventsWidget({ config, events, settings: { count: 8, filter: 'problems' } }),
    buildEventsWidget({ config, events: [], webhooks: PLUS }),
    buildEventsWidget({ config, events: [] }),
    buildEventsWidget({ config: normalizeConfig({}), events: [] }),
  ];
  for (const content of contents) {
    assert.deepEqual(validateWidgetContent(content), []);
  }
  assert.equal(contents[0].components[0].items.length, 5, 'default count');
  const problems = contents[1].components[0].items.map((item) => item.badge.text.en);
  assert.deepEqual(problems, ['Failed', 'Spam report', 'Unsubscribed']);
});

test('the widgets go through the fake Gladys end to end', async (t) => {
  const { gladys, mailgun } = await startApp(t, {
    mailgun: {
      metrics: {
        items: [],
        aggregates: {
          metrics: { accepted_count: 3, delivered_count: 2, failed_count: 1, opened_count: 0 },
        },
      },
    },
    webhooks: {
      available: true,
      webhooks: [{ key: WEBHOOK_KEY, mode: 'fire_and_forget', url: PLUS_URL }],
    },
  });
  const activity = await gladys.fake.widgetGet('activity', { settings: { period: '30d' } });
  assert.equal(activity.success, true);
  assert.deepEqual(validateWidgetContent(activity.data.content), []);
  assert.equal(activity.data.content.components[0].value, 3);

  await gladys.fake.webhook(WEBHOOK_KEY, {
    body: JSON.stringify({ 'event-data': mailgunEvent('delivered') }),
  });
  const events = await gladys.fake.widgetGet('events', { settings: {} });
  assert.equal(events.data.content.components[0].items[0].title, 'Door opened');

  const refresh = await gladys.fake.widgetAction('activity', WIDGET_ACTIONS.REFRESH);
  assert.equal(refresh.success, true);
  const sent = await gladys.fake.widgetAction(
    'activity',
    WIDGET_ACTIONS.SEND_TEST,
    {},
    {
      values: { to: 'bob@example.org' },
    },
  );
  assert.equal(sent.data.message.en, 'Test email sent');
  assert.equal(mailgun.sent.length, 1);
  const refused = await gladys.fake.widgetAction(
    'activity',
    WIDGET_ACTIONS.SEND_TEST,
    {},
    {
      values: {},
    },
  );
  assert.match(refused.data.message.en, /No recipient/);
  for (const text of Object.values(refused.data.message)) {
    assert.ok(text.length <= 200);
  }
});
