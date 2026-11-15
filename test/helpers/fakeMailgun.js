// -----------------------------------------------------------------------------
// A fake Mailgun API, as a `fetch` function: no network in the tests.
//
// It answers the routes the integration uses, keeps the webhooks it is given,
// and records every request (method, path, query, form or JSON body) so the
// tests can assert on what Mailgun would have received.
// -----------------------------------------------------------------------------

/**
 * @param {object} [options]
 * @param {string} [options.apiKey] the key Mailgun accepts
 * @param {string} [options.domain]
 * @param {string} [options.host] API host of the account's region
 * @param {string} [options.domainState]
 * @param {Record<string, string[]>} [options.webhooks]
 * @param {object|number} [options.metrics] answer of the Metrics API, or an error status
 * @param {object} [options.stats] answer of the Stats API
 * @param {number} [options.sendStatus] status of POST /messages (200 by default)
 * @param {boolean} [options.offline] every call fails like a network error
 * @param {boolean} [options.sendingKeyOnly] the key is a domain sending key: it
 *   may send, every other call is refused like Mailgun refuses it
 */
export function createFakeMailgun({
  apiKey = 'key-test',
  domain = 'mg.example.com',
  host = 'api.mailgun.net',
  domainState = 'active',
  webhooks = {},
  metrics = { items: [], aggregates: { metrics: {} } },
  stats = { stats: [] },
  sendStatus = 200,
  offline = false,
  sendingKeyOnly = false,
} = {}) {
  const requests = [];
  const sent = [];
  const hooks = structuredClone(webhooks);
  let counter = 0;

  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  async function fetch(input, init = {}) {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    let body = null;
    if (init.body instanceof FormData) {
      body = {};
      for (const [key, value] of init.body.entries()) {
        const entry =
          typeof value === 'string'
            ? value
            : { name: value.name, type: value.type, size: value.size };
        body[key] = key in body ? [].concat(body[key], entry) : entry;
      }
    } else if (typeof init.body === 'string') {
      body = JSON.parse(init.body);
    }
    const request = {
      method,
      host: url.host,
      path: url.pathname,
      query: [...url.searchParams.entries()],
      headers: init.headers ?? {},
      body,
    };
    requests.push(request);

    if (offline) {
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    }
    if (url.host !== host) {
      return json(404, { message: 'Domain not found' });
    }
    const expected = `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`;
    if (init.headers?.Authorization !== expected) {
      return new Response('Forbidden', { status: 401 });
    }

    const encoded = encodeURIComponent(domain);
    const path = url.pathname;
    if (sendingKeyOnly && !(method === 'POST' && path === `/v3/${encoded}/messages`)) {
      return new Response('Forbidden', { status: 401 });
    }
    if (method === 'POST' && path === `/v3/${encoded}/messages`) {
      if (sendStatus !== 200) {
        return json(sendStatus, { message: `refused (${sendStatus})` });
      }
      counter += 1;
      const id = `<20261115.${counter}@${domain}>`;
      sent.push({ id, ...body });
      return json(200, { id, message: 'Queued. Thank you.' });
    }
    if (method === 'GET' && path === `/v3/domains/${encoded}`) {
      return json(200, { domain: { name: domain, state: domainState } });
    }
    if (method === 'GET' && path === `/v3/domains/${encoded}/webhooks`) {
      return json(200, {
        webhooks: Object.fromEntries(
          Object.entries(hooks).map(([id, urls]) => [id, { urls: [...urls] }]),
        ),
      });
    }
    if (method === 'POST' && path === `/v3/domains/${encoded}/webhooks`) {
      if (hooks[body.id]) {
        return json(400, { message: 'Webhook already exists' });
      }
      hooks[body.id] = [].concat(body.url);
      return json(200, { message: 'Webhook has been created' });
    }
    const hookMatch = new RegExp(`^/v3/domains/${encoded}/webhooks/([a-z_]+)$`).exec(path);
    if (hookMatch && method === 'PUT') {
      hooks[hookMatch[1]] = [].concat(body.url);
      return json(200, { message: 'Webhook has been updated' });
    }
    if (hookMatch && method === 'DELETE') {
      delete hooks[hookMatch[1]];
      return json(200, { message: 'Webhook has been deleted' });
    }
    if (method === 'POST' && path === '/v1/analytics/metrics') {
      return typeof metrics === 'number'
        ? json(metrics, { message: 'not available' })
        : json(200, metrics);
    }
    if (method === 'GET' && path === `/v3/${encoded}/stats/total`) {
      return json(200, stats);
    }
    return json(404, { message: `No route ${method} ${path}` });
  }

  return { fetch, requests, sent, webhooks: hooks };
}
