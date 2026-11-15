import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, CHECK_INTERVAL_MS, WEBHOOK_KEY } from '../src/app.js';
import { WEBHOOK_IDS } from '../src/mailgun/events.js';
import { CONFIG, PLUS_URL, startApp } from './helpers/app.js';
import { SIGNING_KEY, mailgunEvent, signedPayload } from './helpers/signing.js';

const PLUS = {
  available: true,
  webhooks: [{ key: WEBHOOK_KEY, mode: 'fire_and_forget', url: PLUS_URL }],
};

test('connects: status green, periodic check armed, widgets nudged', async (t) => {
  const { gladys, timers } = await startApp(t);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /actif/);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, CHECK_INTERVAL_MS);
  assert.ok(gladys.fake.widgetRefreshes.includes('activity'));
});

test('not configured: status red with what to fill in', async (t) => {
  const { gladys } = await startApp(t, { config: {} });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /API key/);
});

test('a wrong API key turns the status red', async (t) => {
  const { gladys } = await startApp(t, { config: { ...CONFIG, api_key: 'nope' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.de, /API-Schlüssel/);
});

test('a notification is sent to the email of the user, with the camera image', async (t) => {
  const { gladys, mailgun } = await startApp(t, {
    config: { ...CONFIG, notification_subject: 'Maison', sender_name: 'Ma maison' },
  });
  const image = `image/jpg;base64,${Buffer.from([0xff, 0xd8, 0xff]).toString('base64')}`;
  const ack = await gladys.fake.sendMessage(
    { email: 'alice@example.org' },
    { text: 'Motion in the garden', file: image },
  );
  assert.equal(ack.success, true);
  const [sent] = mailgun.sent;
  assert.equal(sent.to, 'alice@example.org');
  assert.equal(sent.subject, 'Maison');
  assert.equal(sent.from, '"Ma maison" <gladys@mg.example.com>');
  assert.equal(sent.text, 'Motion in the garden');
  assert.match(sent.html, /cid:gladys-image\.jpg/);
  assert.equal(sent.inline.type, 'image/jpeg');
});

test('a notification without a valid address is refused, nothing is sent', async (t) => {
  const { gladys, mailgun } = await startApp(t);
  const ack = await gladys.fake.sendMessage({ email: 'not an email' }, { text: 'x', file: null });
  assert.equal(ack.success, false);
  assert.equal(mailgun.sent.length, 0);
});

test('the sending cap stops a loop', async (t) => {
  const config = { ...CONFIG, max_emails_per_hour: 2 };
  const first = await startApp(t, { config });
  for (const expected of [true, true, false]) {
    const ack = await first.gladys.fake.sendMessage(
      { email: 'a@x.org' },
      { text: 'x', file: null },
    );
    assert.equal(ack.success, expected);
  }
  assert.equal(first.mailgun.sent.length, 2);
});

test('the test buttons answer in the four languages', async (t) => {
  const { gladys, mailgun } = await startApp(t);
  const test = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(test.data.message.es, /activo/);
  const sent = await gladys.fake.action(ACTIONS.SEND_TEST_EMAIL, { to: 'bob@example.org' });
  assert.match(sent.data.message.fr, /envoyé à bob@example\.org/);
  assert.equal(mailgun.sent[0]['o:tag'], 'gladys-test');
  const bad = await gladys.fake.action(ACTIONS.SEND_TEST_EMAIL, { to: 'bob' });
  assert.match(bad.data.message.en, /Invalid email address/);
});

test('with Gladys Plus, the webhooks are registered at Mailgun on connection', async (t) => {
  const { mailgun, store } = await startApp(t, { webhooks: PLUS });
  for (const id of WEBHOOK_IDS) {
    assert.deepEqual(mailgun.webhooks[id], [PLUS_URL], id);
  }
  assert.equal(store.webhookUrl, PLUS_URL);
});

test('auto-registration off: only the button registers', async (t) => {
  const { gladys, mailgun } = await startApp(t, {
    config: { ...CONFIG, auto_register_webhooks: false },
    webhooks: PLUS,
  });
  assert.deepEqual(mailgun.webhooks, {});
  const ack = await gladys.fake.action(ACTIONS.REGISTER_WEBHOOKS);
  assert.match(ack.data.message.en, /7 added/);
  assert.deepEqual(mailgun.webhooks.delivered, [PLUS_URL]);
});

test('the register button explains when Gladys Plus is missing', async (t) => {
  const { gladys } = await startApp(t);
  const ack = await gladys.fake.action(ACTIONS.REGISTER_WEBHOOKS);
  assert.match(ack.data.message.fr, /Gladys Plus n'est pas relié/);
});

test('Gladys Plus unlinked: the URL is removed from Mailgun', async (t) => {
  const { gladys, mailgun, store } = await startApp(t, { webhooks: PLUS });
  await gladys.fake.webhookUpdated({ available: false, webhooks: [] });
  assert.deepEqual(mailgun.webhooks, {});
  assert.equal(store.webhookUrl, null);
});

test('a signed Mailgun event fires its scene trigger, once', async (t) => {
  const { gladys, store } = await startApp(t, {
    config: { ...CONFIG, webhook_signing_key: SIGNING_KEY },
    webhooks: PLUS,
  });
  const payload = signedPayload(
    mailgunEvent('failed', {
      severity: 'permanent',
      'delivery-status': { code: 550, description: 'No such mailbox' },
    }),
  );
  const body = JSON.stringify(payload);
  await gladys.fake.webhook(WEBHOOK_KEY, { method: 'POST', body, contentType: 'application/json' });
  await gladys.fake.webhook(WEBHOOK_KEY, { method: 'POST', body, contentType: 'application/json' });
  assert.equal(gladys.fake.sceneEvents.length, 1);
  const [event] = gladys.fake.sceneEvents;
  assert.equal(event.key, 'email_failed');
  assert.equal(event.data.severity, 'permanent');
  assert.equal(event.data.reason, '550 No such mailbox');
  assert.equal(event.data.recipient, 'alice@example.org');
  assert.equal(store.events.length, 1);
  assert.ok(gladys.fake.widgetRefreshes.includes('events'));
});

test('a forged event is dropped when the signing key is set', async (t) => {
  const { gladys } = await startApp(t, {
    config: { ...CONFIG, webhook_signing_key: SIGNING_KEY },
    webhooks: PLUS,
  });
  const forged = signedPayload(mailgunEvent('delivered'), { key: 'attacker-key' });
  await gladys.fake.webhook(WEBHOOK_KEY, { body: JSON.stringify(forged) });
  await gladys.fake.webhook(WEBHOOK_KEY, { body: '{"event-data":{"event":"delivered"}}' });
  await gladys.fake.webhook(WEBHOOK_KEY, { body: 'garbage' });
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('without a signing key, events are accepted (the URL is the secret)', async (t) => {
  const { gladys } = await startApp(t, { webhooks: PLUS });
  await gladys.fake.webhook(WEBHOOK_KEY, {
    body: JSON.stringify({ 'event-data': mailgunEvent('opened') }),
  });
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key),
    ['email_opened'],
  );
});

test('the scene action sends, and reports a failure as outputs', async (t) => {
  const { gladys, mailgun } = await startApp(t);
  const ok = await gladys.fake.sceneAction('send_email', {
    to: 'a@x.org, b@x.org',
    subject: 'Alarm',
    body: 'Door opened',
    cc: '',
    bcc: 'c@x.org',
    reply_to: 'me@x.org',
    tag: 'alarm',
  });
  assert.equal(ok.success, true);
  assert.equal(ok.data.outputs.sent, true);
  assert.match(ok.data.outputs.message_id, /@mg\.example\.com>$/);
  assert.equal(ok.data.outputs.error, '');
  assert.deepEqual(mailgun.sent[0].to, ['a@x.org', 'b@x.org']);
  assert.equal(mailgun.sent[0].bcc, 'c@x.org');

  const bad = await gladys.fake.sceneAction('send_email', { to: 'nope', subject: 's', body: 'b' });
  assert.equal(bad.success, true, 'a scene action is never a condition');
  assert.equal(bad.data.outputs.sent, false);
  assert.match(bad.data.outputs.error, /Invalid email address/);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'an action never fires a trigger');
});

test('Mailgun refusing a send is reported by the scene action', async (t) => {
  const { gladys } = await startApp(t, { mailgun: { sendStatus: 400 } });
  const ack = await gladys.fake.sceneAction('send_email', {
    to: 'a@x.org',
    subject: 's',
    body: 'b',
  });
  assert.equal(ack.data.outputs.sent, false);
  assert.match(ack.data.outputs.error, /error 400/);
});

test('saving the configuration switches region and re-checks', async (t) => {
  const { gladys } = await startApp(t, { mailgun: { host: 'api.eu.mailgun.net' } });
  assert.equal(gladys.fake.connectionStatus.connected, false, 'US host does not know the domain');
  await gladys.fake.configUpdated({ ...CONFIG, region: 'eu' });
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('disconnecting stops the periodic check', async (t) => {
  const { gladys, timers } = await startApp(t, { connect: true });
  await gladys.disconnect();
  assert.equal(timers.length, 0);
});

test('a sending key: red until an email goes through, then green', async (t) => {
  const { gladys } = await startApp(t, { mailgun: { sendingKeyOnly: true } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /sending key/);
  const ack = await gladys.fake.action(ACTIONS.SEND_TEST_EMAIL, { to: 'bob@example.org' });
  assert.match(ack.data.message.en, /Test email sent/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /clé d'envoi/);
  const again = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(again.data.message.en, /Connected with a sending key/);
});
