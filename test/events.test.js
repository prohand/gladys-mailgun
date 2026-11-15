import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENE_TRIGGERS,
  parseWebhookBody,
  sceneEventData,
  toEmailEvent,
} from '../src/mailgun/events.js';
import { mailgunEvent } from './helpers/signing.js';

test('the relayed body is parsed, junk is ignored', () => {
  assert.deepEqual(parseWebhookBody('{"a":1}'), { a: 1 });
  assert.deepEqual(parseWebhookBody({ a: 1 }), { a: 1 });
  assert.equal(parseWebhookBody('not json'), null);
  assert.equal(parseWebhookBody(''), null);
  assert.equal(parseWebhookBody(null), null);
  assert.equal(parseWebhookBody('3'), null);
});

test('each Mailgun event maps to its scene trigger', () => {
  const pairs = {
    delivered: SCENE_TRIGGERS.DELIVERED,
    failed: SCENE_TRIGGERS.FAILED,
    opened: SCENE_TRIGGERS.OPENED,
    clicked: SCENE_TRIGGERS.CLICKED,
    complained: SCENE_TRIGGERS.COMPLAINED,
    unsubscribed: SCENE_TRIGGERS.UNSUBSCRIBED,
  };
  for (const [event, trigger] of Object.entries(pairs)) {
    assert.equal(toEmailEvent({ 'event-data': mailgunEvent(event) }).trigger, trigger);
  }
  assert.equal(toEmailEvent({ 'event-data': mailgunEvent('accepted') }), null);
  assert.equal(toEmailEvent({}), null);
});

test('a failure carries its severity and reason', () => {
  const event = toEmailEvent({
    'event-data': mailgunEvent('failed', {
      severity: 'permanent',
      reason: 'bounce',
      'delivery-status': { code: 550, description: 'No such mailbox' },
    }),
  });
  assert.equal(event.severity, 'permanent');
  assert.equal(event.reason, '550 No such mailbox');
  const data = sceneEventData(event);
  assert.deepEqual(Object.keys(data).sort(), [
    'message_id',
    'reason',
    'recipient',
    'severity',
    'subject',
    'tag',
  ]);
  for (const value of Object.values(data)) {
    assert.equal(typeof value, 'string');
    assert.ok(value.length <= 1000);
  }
});

test('a click carries its URL, other events do not', () => {
  const click = toEmailEvent({
    'event-data': mailgunEvent('clicked', { url: 'https://gladysassistant.com' }),
  });
  assert.equal(sceneEventData(click).url, 'https://gladysassistant.com');
  const open = toEmailEvent({ 'event-data': mailgunEvent('opened', { url: 'x' }) });
  assert.equal('url' in sceneEventData(open), false);
});
