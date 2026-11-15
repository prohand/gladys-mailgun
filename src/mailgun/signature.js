// -----------------------------------------------------------------------------
// Mailgun webhook signatures.
//
// Gladys Plus relays the webhook as it came, without authenticating it: the
// public URL is the only secret. Mailgun signs every call with the domain's
// "HTTP webhook signing key": HMAC-SHA256(key, timestamp + token), hex. When
// the user filled the key in, a call that does not carry the right signature
// is dropped, and so is a replay of a call already seen.
// -----------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Mailgun retries a failed call for about 8 hours: older signatures are refused. */
export const MAX_SIGNATURE_AGE_SECONDS = 24 * 60 * 60;

/** How many tokens are remembered to refuse a replay. */
const SEEN_TOKENS = 1000;

/**
 * Whether `signature` is Mailgun's for these timestamp and token.
 *
 * @param {string} signingKey
 * @param {{ timestamp?: unknown, token?: unknown, signature?: unknown }} signature
 * @returns {boolean}
 */
export function isValidSignature(signingKey, { timestamp, token, signature } = {}) {
  if (!signingKey || typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }
  if (timestamp === undefined || token === undefined) {
    return false;
  }
  const expected = createHmac('sha256', signingKey).update(`${timestamp}${token}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/**
 * A verifier that also refuses old signatures and replays.
 *
 * @param {object} [options]
 * @param {() => number} [options.now] clock, in ms
 */
export function createSignatureVerifier({ now = Date.now } = {}) {
  const seen = new Set();

  return {
    /**
     * @param {string} signingKey
     * @param {object} signature the `signature` object of the payload
     * @returns {'ok' | 'invalid' | 'expired' | 'replayed'}
     */
    verify(signingKey, signature) {
      if (!isValidSignature(signingKey, signature)) {
        return 'invalid';
      }
      const age = now() / 1000 - Number(signature.timestamp);
      if (!Number.isFinite(age) || Math.abs(age) > MAX_SIGNATURE_AGE_SECONDS) {
        return 'expired';
      }
      if (seen.has(signature.token)) {
        return 'replayed';
      }
      seen.add(signature.token);
      if (seen.size > SEEN_TOKENS) {
        seen.delete(seen.values().next().value);
      }
      return 'ok';
    },
  };
}
