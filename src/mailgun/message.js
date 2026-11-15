// -----------------------------------------------------------------------------
// Turn what Gladys or a scene hands over into a Mailgun message.
//
// The texts come from Gladys users and from scene variables: everything that
// ends up in a header loses its line breaks (no header injection), every
// address is checked before Mailgun sees it, and the HTML version escapes the
// text instead of trusting it.
// -----------------------------------------------------------------------------

import { localize, pick } from '../i18n.js';
import { InvalidInputError } from './errors.js';

/** Mailgun takes up to 1000 recipients; a home automation never needs that many. */
export const MAX_RECIPIENTS = 20;

/** Subjects longer than this are cut: mail clients would hide the end anyway. */
const MAX_SUBJECT_LENGTH = 200;

/** Mailgun tags: at most 3 per message, 128 ASCII characters each. */
const MAX_TAGS = 3;

const EMAIL = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]{2,}$/;

/**
 * Whether a string is one plain email address.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL.test(value);
}

/**
 * The addresses of a list typed by hand: "a@x.fr, b@y.fr; c@z.fr".
 *
 * @param {unknown} value
 * @param {object} [options]
 * @param {boolean} [options.required]
 * @param {string} [options.field] name of the field, for the error message
 * @returns {string[]}
 */
export function parseRecipients(value, { required = false, field = 'to' } = {}) {
  const list = String(value ?? '')
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (required && list.length === 0) {
    throw new InvalidInputError(
      `${field}: no recipient`,
      localize((language) =>
        pick(language, {
          en: `No recipient in "${field}".`,
          fr: `Aucun destinataire dans « ${field} ».`,
          de: `Kein Empfänger in „${field}“.`,
          es: `Ningún destinatario en «${field}».`,
        }),
      ),
    );
  }
  const invalid = list.filter((entry) => !isEmail(entry));
  if (invalid.length > 0) {
    const shown = invalid.slice(0, 3).join(', ');
    throw new InvalidInputError(
      `${field}: invalid address`,
      localize((language) =>
        pick(language, {
          en: `Invalid email address in "${field}": ${shown}`,
          fr: `Adresse e-mail invalide dans « ${field} » : ${shown}`,
          de: `Ungültige E-Mail-Adresse in „${field}“: ${shown}`,
          es: `Dirección de correo no válida en «${field}»: ${shown}`,
        }),
      ),
    );
  }
  if (list.length > MAX_RECIPIENTS) {
    throw new InvalidInputError(
      `${field}: too many recipients`,
      localize((language) =>
        pick(language, {
          en: `Too many recipients in "${field}" (${MAX_RECIPIENTS} at most).`,
          fr: `Trop de destinataires dans « ${field} » (${MAX_RECIPIENTS} au maximum).`,
          de: `Zu viele Empfänger in „${field}“ (höchstens ${MAX_RECIPIENTS}).`,
          es: `Demasiados destinatarios en «${field}» (${MAX_RECIPIENTS} como máximo).`,
        }),
      ),
    );
  }
  return [...new Set(list)];
}

/**
 * A header value on one line, without control characters.
 *
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
export function headerValue(value, max = MAX_SUBJECT_LENGTH) {
  return (
    String(value ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
  );
}

/**
 * Mailgun tags of a message: ASCII, no spaces, 3 at most.
 *
 * @param {unknown} value "alarm, garage"
 * @returns {string[]}
 */
export function parseTags(value) {
  return String(value ?? '')
    .split(/[,;]+/)
    .map((tag) =>
      tag
        .trim()
        .replace(/[^\x21-\x7e]/g, '-')
        .slice(0, 128),
    )
    .filter(Boolean)
    .slice(0, MAX_TAGS);
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape a text for HTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * A light HTML version of a plain text: escaped, line breaks kept, links
 * clickable, an optional inline image below.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.imageCid] file name of an inline image
 * @returns {string}
 */
export function textToHtml(text, { imageCid } = {}) {
  const escaped = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1">$1</a>')
    .replace(/\r?\n/g, '<br>\n');
  const image = imageCid
    ? `\n<p><img src="cid:${escapeHtml(imageCid)}" alt="" style="max-width:100%;height:auto"></p>`
    : '';
  return (
    '<!doctype html>\n<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">\n' +
    `<p>${escaped}</p>${image}\n</body></html>\n`
  );
}

const IMAGE_TYPES = {
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * The image Gladys attaches to a notification (a camera snapshot), as a file
 * Mailgun can inline. Gladys sends `image/jpg;base64,…` (with or without the
 * `data:` prefix), or the bare base64.
 *
 * @param {string|null|undefined} file
 * @returns {{ filename: string, contentType: string, data: Buffer } | null}
 */
export function parseAttachedImage(file) {
  if (typeof file !== 'string' || file.trim() === '') {
    return null;
  }
  const match = /^(?:data:)?([a-z]+\/[a-z0-9.+-]+);base64,(.*)$/is.exec(file.trim());
  const contentType = (match?.[1] ?? 'image/jpeg').toLowerCase();
  const extension = IMAGE_TYPES[contentType];
  if (!extension) {
    return null;
  }
  const data = Buffer.from(match ? match[2] : file.trim(), 'base64');
  if (data.length === 0) {
    return null;
  }
  return {
    filename: `gladys-image.${extension}`,
    contentType: contentType === 'image/jpg' ? 'image/jpeg' : contentType,
    data,
  };
}

/**
 * The full message, ready for `client.send`.
 *
 * @param {object} input
 * @param {string} input.from
 * @param {string[]} input.to
 * @param {string[]} [input.cc]
 * @param {string[]} [input.bcc]
 * @param {string} input.subject
 * @param {string} input.text
 * @param {boolean} [input.html] add an HTML version
 * @param {string} [input.replyTo]
 * @param {string[]} [input.tags]
 * @param {string|null} [input.image] attached image, as Gladys sends it
 */
export function buildMessage({
  from,
  to,
  cc = [],
  bcc = [],
  subject,
  text,
  html = true,
  replyTo,
  tags = [],
  image = null,
}) {
  const inline = parseAttachedImage(image);
  const body = String(text ?? '');
  return {
    from,
    to,
    cc,
    bcc,
    subject: headerValue(subject) || 'Gladys',
    text: body,
    html: html ? textToHtml(body, { imageCid: inline?.filename }) : undefined,
    replyTo: replyTo ? headerValue(replyTo, 254) : undefined,
    tags,
    inline: inline ? [inline] : [],
  };
}

/**
 * An address shortened for the logs: `j***@example.com`. The logs end up in
 * bug reports; recipients are personal data.
 *
 * @param {string} address
 * @returns {string}
 */
export function maskEmail(address) {
  const [user, domain] = String(address ?? '').split('@');
  if (!domain) {
    return '***';
  }
  return `${user.slice(0, 1)}***@${domain}`;
}
