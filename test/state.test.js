import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_EVENTS, createStateStore } from '../src/state.js';

test('saves and reloads the events, send times and webhook URL', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'mailgun-state-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createStateStore({ dir });
  await store.load();
  for (let i = 0; i < MAX_EVENTS + 5; i += 1) {
    await store.addEvent({ id: `e${i}`, event: 'delivered' });
  }
  await store.setSent([1, 2, 3]);
  await store.setWebhookUrl('https://hook');

  const again = createStateStore({ dir });
  await again.load();
  assert.equal(again.events.length, MAX_EVENTS);
  assert.equal(again.events[0].id, `e${MAX_EVENTS + 4}`, 'newest first');
  assert.deepEqual(again.sent, [1, 2, 3]);
  assert.equal(again.webhookUrl, 'https://hook');
  const raw = await readFile(join(dir, 'mailgun-state.json'), 'utf8');
  assert.ok(!raw.includes('api_key'));
});

test('a broken file starts empty, an unwritable directory is not fatal', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'mailgun-state-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'mailgun-state.json'), '{nope');
  const warnings = [];
  const store = createStateStore({ dir, logger: { warn: (m) => warnings.push(m) } });
  await store.load();
  assert.deepEqual(store.events, []);
  assert.equal(warnings.length, 1);

  // A directory below a regular file can never be created.
  const readOnly = createStateStore({
    dir: join(dir, 'mailgun-state.json', 'sub'),
    logger: { warn: (m) => warnings.push(m) },
  });
  await readOnly.addEvent({ id: 'x' });
  assert.equal(warnings.length, 2);
});
