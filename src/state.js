// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data.
//
// The container rootfs is read-only: /data is the one writable volume. The
// file holds the last Mailgun events received (for the widget), the send
// times of the last 24 hours (for the sending cap) and the webhook URL
// registered at Mailgun (to replace it, not pile URLs up, when Gladys Plus
// gives a new one). No API key, no secret: those stay in the Gladys config.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Events kept for the widget. */
export const MAX_EVENTS = 20;

const FILE_NAME = 'mailgun-state.json';

const EMPTY = { events: [], sent: [], webhookUrl: null };

/**
 * @param {object} options
 * @param {string} [options.dir] directory of the file (`DATA_DIR`, else /data)
 * @param {{ warn: Function }} [options.logger]
 */
export function createStateStore({ dir = process.env.DATA_DIR || '/data', logger } = {}) {
  const file = join(dir, FILE_NAME);
  let state = structuredClone(EMPTY);
  let writing = Promise.resolve();

  return {
    /** Read the file; a missing or broken file starts empty. */
    async load() {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        state = {
          events: Array.isArray(parsed.events) ? parsed.events.slice(0, MAX_EVENTS) : [],
          sent: Array.isArray(parsed.sent) ? parsed.sent.filter(Number.isFinite) : [],
          webhookUrl: typeof parsed.webhookUrl === 'string' ? parsed.webhookUrl : null,
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`State file unreadable, starting empty: ${err.message}`);
        }
        state = structuredClone(EMPTY);
      }
      return state;
    },

    get events() {
      return state.events;
    },

    get sent() {
      return state.sent;
    },

    get webhookUrl() {
      return state.webhookUrl;
    },

    /** Add an event on top of the list (newest first). */
    addEvent(event) {
      state.events = [event, ...state.events.filter((entry) => entry.id !== event.id)].slice(
        0,
        MAX_EVENTS,
      );
      return this.save();
    },

    setSent(history) {
      state.sent = history;
      return this.save();
    },

    setWebhookUrl(url) {
      state.webhookUrl = url;
      return this.save();
    },

    /**
     * Write the file (temporary file + rename: a crash never leaves half a
     * file). Writes are queued; a failure is logged, never thrown — losing
     * the widget history is not worth failing a send.
     */
    save() {
      const snapshot = JSON.stringify(state);
      writing = writing.then(async () => {
        try {
          await mkdir(dir, { recursive: true });
          await writeFile(`${file}.tmp`, snapshot, 'utf8');
          await rename(`${file}.tmp`, file);
        } catch (err) {
          logger?.warn(`State file not saved: ${err.message}`);
        }
      });
      return writing;
    },
  };
}
