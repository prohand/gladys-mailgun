// -----------------------------------------------------------------------------
// Register the Gladys Plus URL on the Mailgun webhooks of the domain.
//
// Mailgun keeps up to 3 URLs per webhook id. The integration adds its own URL
// next to the ones the user may already have (another tool reading the same
// events), removes the URL it registered before when Gladys Plus gave a new
// one, and never touches the others.
// -----------------------------------------------------------------------------

import { WEBHOOK_IDS } from './events.js';

/** Mailgun refuses a fourth URL on a webhook id. */
export const MAX_URLS_PER_WEBHOOK = 3;

/**
 * @param {ReturnType<import('./client.js').createMailgunClient>} client
 * @param {string} url the public URL Gladys Plus gave for the `events` webhook
 * @param {object} [options]
 * @param {string|null} [options.previousUrl] the URL registered last time
 * @returns {Promise<{ added: string[], unchanged: string[], full: string[] }>}
 */
export async function registerWebhooks(client, url, { previousUrl = null } = {}) {
  const current = await client.listWebhooks();
  const result = { added: [], unchanged: [], full: [] };

  for (const id of WEBHOOK_IDS) {
    const urls = current[id] ?? [];
    const kept = urls.filter((entry) => entry !== previousUrl || previousUrl === url);
    if (kept.includes(url) && kept.length === urls.length) {
      result.unchanged.push(id);
      continue;
    }
    const next = kept.includes(url) ? kept : [...kept, url];
    if (next.length > MAX_URLS_PER_WEBHOOK) {
      result.full.push(id);
      continue;
    }
    if (urls.length === 0) {
      await client.createWebhook(id, next);
    } else {
      await client.updateWebhook(id, next);
    }
    result.added.push(id);
  }
  return result;
}

/**
 * Remove the URL of the integration from the webhooks (Gladys Plus unlinked).
 *
 * @param {ReturnType<import('./client.js').createMailgunClient>} client
 * @param {string} url
 * @returns {Promise<string[]>} the webhook ids it was removed from
 */
export async function unregisterWebhooks(client, url) {
  const current = await client.listWebhooks();
  const removed = [];
  for (const id of WEBHOOK_IDS) {
    const urls = current[id] ?? [];
    if (!urls.includes(url)) {
      continue;
    }
    const next = urls.filter((entry) => entry !== url);
    if (next.length === 0) {
      await client.deleteWebhook(id);
    } else {
      await client.updateWebhook(id, next);
    }
    removed.push(id);
  }
  return removed;
}
