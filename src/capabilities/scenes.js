// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Scene TRIGGERS need no handler: the webhook handler fires them with
// publishSceneEvent (see src/mailgun/events.js for their keys and data).
// -----------------------------------------------------------------------------

import { describeError } from '../mailgun/errors.js';
import { parseRecipients, parseTags } from '../mailgun/message.js';

/** Keys of the manifest `scene_actions`. Never renamed: scenes store them. */
export const SCENE_ACTIONS = {
  SEND_EMAIL: 'send_email',
};

/**
 * The `send_email` action: send an email from a scene.
 *
 * A scene action is never a condition: a failure resolves `sent: false` and
 * the reason, so the scene author can gate the following actions on it,
 * instead of throwing. The action never fires a scene trigger itself (no
 * loop through the integration).
 *
 * @param {object} fields the RESOLVED fields (scene variables substituted)
 * @param {object} context
 * @param {(email: object) => Promise<{ id: string }>} context.sendEmail
 * @param {string} [context.language] language of the error text
 * @returns {Promise<{ sent: boolean, message_id: string, error: string }>}
 */
export async function sendEmailAction(fields, { sendEmail, language = 'en' }) {
  try {
    const result = await sendEmail({
      to: parseRecipients(fields.to, { required: true, field: 'to' }),
      cc: parseRecipients(fields.cc, { field: 'cc' }),
      bcc: parseRecipients(fields.bcc, { field: 'bcc' }),
      replyTo: fields.reply_to ? parseRecipients(fields.reply_to, { field: 'reply_to' })[0] : '',
      subject: fields.subject,
      text: fields.body,
      tags: parseTags(fields.tag),
    });
    return { sent: true, message_id: result.id, error: '' };
  } catch (err) {
    const text = describeError(err);
    return { sent: false, message_id: '', error: text[language] ?? text.en };
  }
}
