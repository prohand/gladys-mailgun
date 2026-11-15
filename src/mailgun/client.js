// -----------------------------------------------------------------------------
// The Mailgun HTTP API, reduced to what the integration uses.
//
// One client per configuration: it is rebuilt when the user saves the form.
// `fetch` is injected so the tests never touch the network. The API key goes
// in the Authorization header only: it is never logged, never part of a URL,
// never part of an error message.
// -----------------------------------------------------------------------------

import { REGIONS } from '../config.js';
import { MailgunError } from './errors.js';

/** Past this delay a Mailgun call is abandoned (the Gladys acks wait 15 s). */
const TIMEOUT_MS = 12_000;

/**
 * @param {object} options
 * @param {string} options.apiKey private API key (or a domain sending key)
 * @param {string} options.domain sending domain, e.g. mg.example.com
 * @param {'us'|'eu'} [options.region]
 * @param {typeof fetch} [options.fetch]
 */
export function createMailgunClient({ apiKey, domain, region = 'us', fetch = globalThis.fetch }) {
  const baseUrl = REGIONS[region] ?? REGIONS.us;
  const authorization = `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`;
  const encodedDomain = encodeURIComponent(domain);

  async function request(method, path, { form, json, query } = {}) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of query ?? []) {
      url.searchParams.append(key, value);
    }
    const headers = { Authorization: authorization, Accept: 'application/json' };
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form !== undefined) {
      body = form;
    }

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new MailgunError(0, err?.cause?.code ?? err?.name ?? 'network error');
    }

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      // Mailgun answers `{ message }` most of the time, plain text sometimes
      // (a 401 is "Forbidden"). Keep it short: it ends up in a toast.
      const message = (data?.message ?? raw ?? '').toString().slice(0, 200).trim();
      throw new MailgunError(response.status, message || response.statusText);
    }
    return data;
  }

  return {
    domain,
    region: region in REGIONS ? region : 'us',

    /**
     * Send one email.
     *
     * @param {object} message
     * @param {string} message.from
     * @param {string[]} message.to
     * @param {string[]} [message.cc]
     * @param {string[]} [message.bcc]
     * @param {string} message.subject
     * @param {string} message.text
     * @param {string} [message.html]
     * @param {string} [message.replyTo]
     * @param {string[]} [message.tags]
     * @param {{ filename: string, contentType: string, data: Buffer }[]} [message.inline]
     * @returns {Promise<{ id: string, message: string }>}
     */
    async send(message) {
      const form = new FormData();
      form.append('from', message.from);
      for (const to of message.to) form.append('to', to);
      for (const cc of message.cc ?? []) form.append('cc', cc);
      for (const bcc of message.bcc ?? []) form.append('bcc', bcc);
      form.append('subject', message.subject);
      form.append('text', message.text);
      if (message.html) form.append('html', message.html);
      if (message.replyTo) form.append('h:Reply-To', message.replyTo);
      for (const tag of message.tags ?? []) form.append('o:tag', tag);
      for (const file of message.inline ?? []) {
        form.append('inline', new Blob([file.data], { type: file.contentType }), file.filename);
      }
      const data = await request('POST', `/v3/${encodedDomain}/messages`, { form });
      return { id: data?.id ?? '', message: data?.message ?? '' };
    },

    /** The domain as Mailgun sees it: `{ name, state, ... }`. */
    async getDomain() {
      const data = await request('GET', `/v3/domains/${encodedDomain}`);
      return data?.domain ?? {};
    },

    /** The webhook URLs of the domain, per event: `{ delivered: ['https://…'] }`. */
    async listWebhooks() {
      const data = await request('GET', `/v3/domains/${encodedDomain}/webhooks`);
      const result = {};
      for (const [id, entry] of Object.entries(data?.webhooks ?? {})) {
        // Current API: `{ urls: [...] }`; accounts created long ago: `{ url }`.
        result[id] = Array.isArray(entry?.urls) ? entry.urls : entry?.url ? [entry.url] : [];
      }
      return result;
    },

    /** Create the webhook of one event (it had none). */
    async createWebhook(id, urls) {
      const form = new FormData();
      form.append('id', id);
      for (const url of urls) form.append('url', url);
      return request('POST', `/v3/domains/${encodedDomain}/webhooks`, { form });
    },

    /** Replace the URLs of the webhook of one event. */
    async updateWebhook(id, urls) {
      const form = new FormData();
      for (const url of urls) form.append('url', url);
      return request('PUT', `/v3/domains/${encodedDomain}/webhooks/${encodeURIComponent(id)}`, {
        form,
      });
    },

    /** Remove the webhook of one event. */
    async deleteWebhook(id) {
      return request('DELETE', `/v3/domains/${encodedDomain}/webhooks/${encodeURIComponent(id)}`);
    },

    /** The Metrics API (`POST /v1/analytics/metrics`). */
    async metrics(body) {
      return request('POST', '/v1/analytics/metrics', { json: body });
    },

    /** The older Stats API, kept as a fallback for accounts without Metrics. */
    async statsTotal(query) {
      return request('GET', `/v3/${encodedDomain}/stats/total`, { query });
    },
  };
}
