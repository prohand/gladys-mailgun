// A webhook payload signed like Mailgun signs it.

import { createHmac, randomBytes } from 'node:crypto';

export const SIGNING_KEY = 'whsec-test-signing-key';

/**
 * @param {object} eventData the `event-data` object
 * @param {object} [options]
 * @param {string} [options.key] signing key
 * @param {number} [options.timestamp] seconds
 */
export function signedPayload(eventData, { key = SIGNING_KEY, timestamp } = {}) {
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  const token = randomBytes(25).toString('hex');
  const signature = createHmac('sha256', key).update(`${ts}${token}`).digest('hex');
  return { signature: { timestamp: ts, token, signature }, 'event-data': eventData };
}

/** A typical Mailgun event. */
export function mailgunEvent(event, extra = {}) {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    event,
    timestamp: Date.now() / 1000,
    recipient: 'alice@example.org',
    tags: ['alarm'],
    message: { headers: { subject: 'Door opened', 'message-id': '20261115.1@mg.example.com' } },
    ...extra,
  };
}
