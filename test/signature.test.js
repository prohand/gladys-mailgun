import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSignatureVerifier, isValidSignature } from '../src/mailgun/signature.js';
import { SIGNING_KEY, signedPayload } from './helpers/signing.js';

test('a Mailgun signature is checked with the signing key', () => {
  const { signature } = signedPayload({});
  assert.ok(isValidSignature(SIGNING_KEY, signature));
  assert.ok(!isValidSignature('other-key', signature));
  assert.ok(!isValidSignature(SIGNING_KEY, { ...signature, token: 'changed' }));
  assert.ok(!isValidSignature(SIGNING_KEY, { ...signature, signature: 'zz' }));
  assert.ok(!isValidSignature('', signature));
  assert.ok(!isValidSignature(SIGNING_KEY, undefined));
});

test('old signatures and replays are refused', () => {
  const now = Date.now();
  const verifier = createSignatureVerifier({ now: () => now });
  const fresh = signedPayload({}, { timestamp: Math.floor(now / 1000) }).signature;
  assert.equal(verifier.verify(SIGNING_KEY, fresh), 'ok');
  assert.equal(verifier.verify(SIGNING_KEY, fresh), 'replayed');
  const old = signedPayload({}, { timestamp: Math.floor(now / 1000) - 2 * 86400 }).signature;
  assert.equal(verifier.verify(SIGNING_KEY, old), 'expired');
  assert.equal(verifier.verify('bad', fresh), 'invalid');
});
