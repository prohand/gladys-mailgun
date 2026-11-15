// -----------------------------------------------------------------------------
// Configuration defaults and normalization.
//
// DEFAULT_CONFIG mirrors the `default` values of the manifest `config_schema`
// (test/manifest.test.js keeps both in sync). normalizeConfig() turns whatever
// Gladys sends (strings from the form, missing keys, stray spaces) into the
// typed object the rest of the code relies on.
// -----------------------------------------------------------------------------

/** Mailgun keeps the data of an account in one region, with its own API host. */
export const REGIONS = {
  us: 'https://api.mailgun.net',
  eu: 'https://api.eu.mailgun.net',
};

/** Bounds of the sending cap, the same as the manifest field. */
export const MAX_EMAILS_PER_HOUR = { min: 1, max: 1000 };

export const DEFAULT_CONFIG = {
  api_key: '',
  domain: '',
  region: 'us',
  sender_name: 'Gladys',
  sender_address: '',
  notification_subject: 'Gladys',
  html_format: true,
  max_emails_per_hour: 60,
  auto_register_webhooks: true,
  webhook_signing_key: '',
};

function text(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value).trim();
}

function bool(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return fallback;
}

function clamp(value, { min, max }, fallback) {
  const number = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * The domain as Mailgun names it: no scheme, no path, lower case. Users often
 * paste `https://mg.example.com/` or the domain with a trailing dot.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeDomain(value) {
  return text(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
}

/**
 * The typed configuration.
 *
 * @param {Record<string, unknown>} [raw] the values Gladys sends
 * @returns {typeof DEFAULT_CONFIG & { configured: boolean, from: string }}
 */
export function normalizeConfig(raw = {}) {
  const source = raw ?? {};
  const domain = normalizeDomain(source.domain);
  const region = text(source.region, DEFAULT_CONFIG.region).toLowerCase();
  const senderName = text(source.sender_name, DEFAULT_CONFIG.sender_name);
  const senderAddress = text(source.sender_address);

  const config = {
    api_key: text(source.api_key),
    domain,
    region: region in REGIONS ? region : DEFAULT_CONFIG.region,
    sender_name: senderName === '' ? DEFAULT_CONFIG.sender_name : senderName,
    sender_address: senderAddress,
    notification_subject: text(source.notification_subject) || DEFAULT_CONFIG.notification_subject,
    html_format: bool(source.html_format, DEFAULT_CONFIG.html_format),
    max_emails_per_hour: clamp(
      source.max_emails_per_hour,
      MAX_EMAILS_PER_HOUR,
      DEFAULT_CONFIG.max_emails_per_hour,
    ),
    auto_register_webhooks: bool(
      source.auto_register_webhooks,
      DEFAULT_CONFIG.auto_register_webhooks,
    ),
    webhook_signing_key: text(source.webhook_signing_key),
  };
  config.configured = config.api_key !== '' && config.domain !== '';
  config.from = formatFrom(config);
  return config;
}

/**
 * The `From` header: `"Gladys" <gladys@mg.example.com>`. The name loses the
 * characters that would let it break out of the quotes or of the header line.
 *
 * @param {{ sender_name: string, sender_address: string, domain: string }} config
 * @returns {string}
 */
export function formatFrom({ sender_name: name, sender_address: address, domain }) {
  const email = address || (domain ? `gladys@${domain}` : '');
  const safeName = String(name ?? '')
    .replace(/[\r\n"<>\\]/g, '')
    .trim();
  if (!email) {
    return '';
  }
  return safeName ? `"${safeName}" <${email}>` : email;
}
