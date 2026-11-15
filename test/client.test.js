import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailgunClient } from '../src/mailgun/client.js';
import { MailgunError, describeError } from '../src/mailgun/errors.js';
import { createFakeMailgun } from './helpers/fakeMailgun.js';

const options = (fake, extra = {}) => ({
  apiKey: 'key-test',
  domain: 'mg.example.com',
  fetch: fake.fetch,
  ...extra,
});

test('sends a message as a multipart form, with basic auth', async () => {
  const fake = createFakeMailgun();
  const client = createMailgunClient(options(fake));
  const result = await client.send({
    from: '"Gladys" <gladys@mg.example.com>',
    to: ['a@x.org', 'b@x.org'],
    cc: ['c@x.org'],
    subject: 'Hello',
    text: 'Body',
    html: '<p>Body</p>',
    replyTo: 'me@x.org',
    tags: ['alarm'],
    inline: [
      { filename: 'gladys-image.jpg', contentType: 'image/jpeg', data: Buffer.from([1, 2]) },
    ],
  });
  assert.match(result.id, /@mg\.example\.com>$/);
  const [sent] = fake.sent;
  assert.deepEqual(sent.to, ['a@x.org', 'b@x.org']);
  assert.equal(sent.cc, 'c@x.org');
  assert.equal(sent['h:Reply-To'], 'me@x.org');
  assert.equal(sent['o:tag'], 'alarm');
  assert.deepEqual(sent.inline, { name: 'gladys-image.jpg', type: 'image/jpeg', size: 2 });
  assert.equal(fake.requests[0].host, 'api.mailgun.net');
});

test('the EU region uses the EU host', async () => {
  const fake = createFakeMailgun({ host: 'api.eu.mailgun.net' });
  const client = createMailgunClient(options(fake, { region: 'eu' }));
  assert.equal((await client.getDomain()).state, 'active');
  const wrongRegion = createMailgunClient(options(fake, { region: 'us' }));
  await assert.rejects(wrongRegion.getDomain(), (err) => err.status === 404);
});

test('errors carry the status and a short message, never the key', async () => {
  const fake = createFakeMailgun();
  const client = createMailgunClient(options(fake, { apiKey: 'wrong-secret-key' }));
  await assert.rejects(client.getDomain(), (err) => {
    assert.ok(err instanceof MailgunError);
    assert.equal(err.status, 401);
    assert.ok(!err.message.includes('wrong-secret-key'));
    return true;
  });
  const offline = createMailgunClient(options(createFakeMailgun({ offline: true })));
  await assert.rejects(offline.getDomain(), (err) => err.status === 0);
});

test('every error has a sentence in the four languages', () => {
  for (const status of [0, 401, 403, 404, 429, 500]) {
    const texts = describeError(new MailgunError(status, 'x'));
    assert.deepEqual(Object.keys(texts).sort(), ['de', 'en', 'es', 'fr']);
  }
  assert.ok(describeError(new Error('boom')).fr.includes('boom'));
});

test('webhooks are listed per event, old single-URL shape included', async () => {
  const fake = createFakeMailgun({ webhooks: { delivered: ['https://a'] } });
  const client = createMailgunClient(options(fake));
  assert.deepEqual(await client.listWebhooks(), { delivered: ['https://a'] });

  const legacy = createMailgunClient({
    ...options(fake),
    fetch: async () =>
      new Response(JSON.stringify({ webhooks: { opened: { url: 'https://b' } } }), { status: 200 }),
  });
  assert.deepEqual(await legacy.listWebhooks(), { opened: ['https://b'] });
});
