// -----------------------------------------------------------------------------
// The sending cap.
//
// A scene that loops ("when an email fails, send an email"), or a sensor that
// flaps and notifies on every change, can send thousands of emails — billed by
// Mailgun, and enough to get a domain flagged as spam. The integration refuses
// to send more than `max_emails_per_hour` in any sliding hour.
// -----------------------------------------------------------------------------

import { SendLimitError } from './errors.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * @param {object} options
 * @param {number[]} [options.history] send times already known (ms), oldest first
 * @param {() => number} [options.now]
 */
export function createSendLimiter({ history = [], now = Date.now } = {}) {
  let sent = history.filter((time) => Number.isFinite(time) && now() - time < DAY_MS);

  function prune() {
    const limit = now() - DAY_MS;
    while (sent.length > 0 && sent[0] <= limit) {
      sent.shift();
    }
  }

  return {
    /** Throws SendLimitError when `recipients` more emails would pass the cap. */
    check(maxPerHour, recipients = 1) {
      prune();
      const since = now() - HOUR_MS;
      const lastHour = sent.filter((time) => time > since).length;
      if (lastHour + recipients > maxPerHour) {
        throw new SendLimitError(maxPerHour);
      }
    },

    /** Count emails just sent (one per recipient: that is what Mailgun bills). */
    record(recipients = 1) {
      const time = now();
      for (let i = 0; i < recipients; i += 1) {
        sent.push(time);
      }
    },

    /** Emails sent in the last hour and in the last 24 hours. */
    counts() {
      prune();
      const since = now() - HOUR_MS;
      return { lastHour: sent.filter((time) => time > since).length, lastDay: sent.length };
    },

    /** The send times to persist. */
    history() {
      prune();
      return [...sent];
    },
  };
}
