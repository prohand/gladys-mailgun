// Start the whole integration against the fake Gladys of the SDK and a fake
// Mailgun: no network, no timer left behind, the state in a temporary folder.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { createStateStore } from '../../src/state.js';
import { createFakeMailgun } from './fakeMailgun.js';

export const CONFIG = { api_key: 'key-test', domain: 'mg.example.com', region: 'us' };

export const PLUS_URL = 'https://api.gladysgateway.com/v1/api/integration/webhook/abc/events';

/**
 * @param {import('node:test').TestContext} t
 * @param {object} [options]
 * @param {object} [options.config]
 * @param {object} [options.mailgun] options of the fake Mailgun
 * @param {object} [options.webhooks] Gladys Plus webhook state
 * @param {boolean} [options.connect]
 */
export async function startApp(
  t,
  { config = CONFIG, mailgun = {}, webhooks, connect = true } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'mailgun-app-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fake = createFakeMailgun(mailgun);
  const gladys = createFakeGladys({ config, webhooks });
  const logger = createLogger({ level: 'silent' });
  const store = createStateStore({ dir, logger });
  const timers = [];
  const app = createApp(gladys, {
    fetch: fake.fetch,
    store,
    logger,
    setInterval: (fn, ms) => {
      const timer = { fn, ms };
      timers.push(timer);
      return timer;
    },
    clearInterval: (timer) => {
      timers.splice(timers.indexOf(timer), 1);
    },
  });
  if (connect) {
    await gladys.connect();
    t.after(() => gladys.disconnect());
  }
  return { gladys, app, mailgun: fake, store, timers, dir };
}
