import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailgunClient } from '../src/mailgun/client.js';
import { WEBHOOK_IDS } from '../src/mailgun/events.js';
import { registerWebhooks, unregisterWebhooks } from '../src/mailgun/webhooks.js';
import { createFakeMailgun } from './helpers/fakeMailgun.js';

const URL_A = 'https://plus.gladysassistant.com/webhook/a';
const URL_B = 'https://plus.gladysassistant.com/webhook/b';

function setup(webhooks) {
  const fake = createFakeMailgun({ webhooks });
  const client = createMailgunClient({
    apiKey: 'key-test',
    domain: 'mg.example.com',
    fetch: fake.fetch,
  });
  return { fake, client };
}

test('registers the URL on every event, keeping the URLs of other tools', async () => {
  const { fake, client } = setup({ delivered: ['https://other.tool/hook'] });
  const result = await registerWebhooks(client, URL_A);
  assert.equal(result.added.length, WEBHOOK_IDS.length);
  assert.deepEqual(fake.webhooks.delivered, ['https://other.tool/hook', URL_A]);
  for (const id of WEBHOOK_IDS) {
    assert.ok(fake.webhooks[id].includes(URL_A), id);
  }
});

test('a second run changes nothing', async () => {
  const { fake, client } = setup({});
  await registerWebhooks(client, URL_A);
  const before = fake.requests.length;
  const result = await registerWebhooks(client, URL_A, { previousUrl: URL_A });
  assert.equal(result.unchanged.length, WEBHOOK_IDS.length);
  assert.equal(fake.requests.length, before + 1, 'only the listing');
});

test('a new Gladys Plus URL replaces the old one instead of piling up', async () => {
  const { fake, client } = setup({});
  await registerWebhooks(client, URL_A);
  await registerWebhooks(client, URL_B, { previousUrl: URL_A });
  for (const id of WEBHOOK_IDS) {
    assert.deepEqual(fake.webhooks[id], [URL_B], id);
  }
});

test('a webhook already holding 3 URLs is reported, not overwritten', async () => {
  const full = ['https://1', 'https://2', 'https://3'];
  const { fake, client } = setup({ opened: full });
  const result = await registerWebhooks(client, URL_A);
  assert.deepEqual(result.full, ['opened']);
  assert.deepEqual(fake.webhooks.opened, full);
});

test('unregistering removes only our URL', async () => {
  const { fake, client } = setup({ delivered: ['https://other', URL_A], opened: [URL_A] });
  const removed = await unregisterWebhooks(client, URL_A);
  assert.deepEqual(removed.sort(), ['delivered', 'opened']);
  assert.deepEqual(fake.webhooks.delivered, ['https://other']);
  assert.equal(fake.webhooks.opened, undefined);
});
