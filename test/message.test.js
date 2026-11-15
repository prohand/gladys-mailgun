import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RECIPIENTS,
  buildMessage,
  headerValue,
  isEmail,
  maskEmail,
  parseAttachedImage,
  parseRecipients,
  parseTags,
  textToHtml,
} from '../src/mailgun/message.js';
import { InvalidInputError } from '../src/mailgun/errors.js';

test('email addresses', () => {
  assert.ok(isEmail('alice@example.org'));
  assert.ok(isEmail('a.b+tag@sub.example.co.uk'));
  assert.ok(!isEmail('alice@example'));
  assert.ok(!isEmail('alice example@x.org'));
  assert.ok(!isEmail('"Alice" <alice@example.org>'));
  assert.ok(!isEmail('alice@example.org\nBcc: x@y.z'));
});

test('recipient lists accept commas, semicolons and spaces', () => {
  assert.deepEqual(parseRecipients('a@x.org, b@y.org;c@z.org  a@x.org'), [
    'a@x.org',
    'b@y.org',
    'c@z.org',
  ]);
  assert.deepEqual(parseRecipients(''), []);
  assert.deepEqual(parseRecipients(undefined), []);
});

test('a bad recipient list is refused with a translated message', () => {
  assert.throws(() => parseRecipients('', { required: true }), InvalidInputError);
  assert.throws(
    () => parseRecipients('a@x.org, nope'),
    (err) => err instanceof InvalidInputError && /nope/.test(err.texts.fr) && Boolean(err.texts.de),
  );
  const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `u${i}@x.org`).join(',');
  assert.throws(() => parseRecipients(many), InvalidInputError);
});

test('header values stay on one line', () => {
  assert.equal(headerValue('Alarm\r\nBcc: evil@x.com'), 'Alarm Bcc: evil@x.com');
  assert.equal(headerValue('x'.repeat(500)).length, 200);
});

test('tags are ASCII, 3 at most', () => {
  assert.deepEqual(parseTags('alarm, garage door, été, x, y'), ['alarm', 'garage-door', '-t-']);
  assert.deepEqual(parseTags(''), []);
});

test('the HTML version escapes the text and makes links clickable', () => {
  const html = textToHtml('<script>alert(1)</script>\nSee https://gladysassistant.com.');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(
    html.includes('<a href="https://gladysassistant.com">https://gladysassistant.com</a>.'),
  );
  assert.ok(html.includes('<br>'));
});

test('the attached camera image becomes an inline file', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64');
  for (const file of [`image/jpg;base64,${jpeg}`, `data:image/jpeg;base64,${jpeg}`, jpeg]) {
    const image = parseAttachedImage(file);
    assert.equal(image.contentType, 'image/jpeg');
    assert.equal(image.filename, 'gladys-image.jpg');
    assert.equal(image.data.length, 4);
  }
  assert.equal(parseAttachedImage(null), null);
  assert.equal(parseAttachedImage('application/pdf;base64,AAAA'), null);
});

test('buildMessage puts it all together', () => {
  const jpeg = Buffer.from([0xff, 0xd8]).toString('base64');
  const message = buildMessage({
    from: 'g@mg.example.com',
    to: ['a@x.org'],
    subject: 'Hello\nthere',
    text: 'Body',
    image: `image/jpg;base64,${jpeg}`,
  });
  assert.equal(message.subject, 'Hello there');
  assert.equal(message.inline.length, 1);
  assert.ok(message.html.includes('cid:gladys-image.jpg'));
  assert.equal(
    buildMessage({ from: 'g', to: [], subject: '', text: 'x', html: false }).html,
    undefined,
  );
  assert.equal(buildMessage({ from: 'g', to: [], subject: '', text: 'x' }).subject, 'Gladys');
});

test('addresses are masked in the logs', () => {
  assert.equal(maskEmail('alice@example.org'), 'a***@example.org');
  assert.equal(maskEmail('nope'), '***');
});
