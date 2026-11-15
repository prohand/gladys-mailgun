// -----------------------------------------------------------------------------
// The events Mailgun pushes, turned into Gladys scene events.
//
// A Mailgun webhook call carries one event (`event-data`). Only the events a
// home automation reacts to are kept — delivered, failed, opened, clicked,
// complained, unsubscribed — and only flat, short values go to the scene
// (the core takes at most 30 primitive keys, strings of 1000 characters).
// -----------------------------------------------------------------------------

/**
 * Keys of the manifest `scene_triggers`. Never renamed: scenes store them.
 */
export const SCENE_TRIGGERS = {
  DELIVERED: 'email_delivered',
  FAILED: 'email_failed',
  OPENED: 'email_opened',
  CLICKED: 'email_clicked',
  COMPLAINED: 'email_complained',
  UNSUBSCRIBED: 'email_unsubscribed',
};

/** Mailgun event name -> scene trigger key. */
const TRIGGER_OF_EVENT = {
  delivered: SCENE_TRIGGERS.DELIVERED,
  failed: SCENE_TRIGGERS.FAILED,
  opened: SCENE_TRIGGERS.OPENED,
  clicked: SCENE_TRIGGERS.CLICKED,
  complained: SCENE_TRIGGERS.COMPLAINED,
  unsubscribed: SCENE_TRIGGERS.UNSUBSCRIBED,
};

/**
 * The Mailgun webhook ids the integration registers its URL on. A webhook id
 * is not an event name: a failure has two ids (permanent / temporary).
 */
export const WEBHOOK_IDS = [
  'delivered',
  'permanent_fail',
  'temporary_fail',
  'opened',
  'clicked',
  'complained',
  'unsubscribed',
];

/** Failure severities, the values of the `severity` filter of `email_failed`. */
export const SEVERITIES = ['permanent', 'temporary'];

function short(value, max = 500) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).slice(0, max);
}

/**
 * Parse the raw body Gladys Plus relays.
 *
 * @param {string|object|null} body
 * @returns {object|null} the payload, or null when it is not Mailgun JSON
 */
export function parseWebhookBody(body) {
  if (body && typeof body === 'object') {
    return body;
  }
  if (typeof body !== 'string' || body.trim() === '') {
    return null;
  }
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The event a payload carries, in the shape the integration keeps.
 *
 * @param {object} payload the parsed webhook body
 * @returns {null | {
 *   id: string, event: string, trigger: string, at: string, recipient: string,
 *   subject: string, message_id: string, tag: string, severity: string,
 *   reason: string, url: string
 * }}
 */
export function toEmailEvent(payload) {
  const data = payload?.['event-data'];
  if (!data || typeof data !== 'object') {
    return null;
  }
  const trigger = TRIGGER_OF_EVENT[data.event];
  if (!trigger) {
    return null;
  }
  const headers = data.message?.headers ?? {};
  const status = data['delivery-status'] ?? {};
  const seconds = Number(data.timestamp);
  const at = Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const reason =
    data.event === 'failed'
      ? [status.code, status.description || status.message || data.reason]
          .filter((part) => part !== undefined && part !== null && part !== '')
          .join(' ')
      : '';

  return {
    id: short(data.id, 100),
    event: data.event,
    trigger,
    at: at.toISOString(),
    recipient: short(data.recipient, 254),
    subject: short(headers.subject, 200),
    message_id: short(headers['message-id'], 200),
    tag: short(tags[0], 128),
    severity: data.event === 'failed' ? short(data.severity, 20) : '',
    reason: short(reason, 300),
    url: data.event === 'clicked' ? short(data.url, 1000) : '',
  };
}

/**
 * The `data` of the scene event: only the keys the manifest declares for this
 * trigger (fields and variables), so nothing unexpected reaches the scenes.
 *
 * @param {ReturnType<typeof toEmailEvent>} event
 * @returns {Record<string, string>}
 */
export function sceneEventData(event) {
  const data = {
    recipient: event.recipient,
    subject: event.subject,
    tag: event.tag,
    message_id: event.message_id,
  };
  if (event.trigger === SCENE_TRIGGERS.FAILED) {
    data.severity = event.severity;
    data.reason = event.reason;
  }
  if (event.trigger === SCENE_TRIGGERS.CLICKED) {
    data.url = event.url;
  }
  return data;
}
