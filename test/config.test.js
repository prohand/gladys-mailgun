import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, formatFrom, normalizeConfig, normalizeDomain } from '../src/config.js';

test('an empty configuration is not configured and keeps the defaults', () => {
  const config = normalizeConfig();
  assert.equal(config.configured, false);
  assert.equal(config.region, 'us');
  assert.equal(config.max_emails_per_hour, DEFAULT_CONFIG.max_emails_per_hour);
  assert.equal(config.html_format, true);
  assert.equal(config.from, '');
});

test('values from the form are typed and trimmed', () => {
  const config = normalizeConfig({
    api_key: '  key-1  ',
    domain: 'https://MG.Example.com/',
    region: 'EU',
    html_format: 'false',
    max_emails_per_hour: '5000',
    auto_register_webhooks: 0,
  });
  assert.equal(config.configured, true);
  assert.equal(config.api_key, 'key-1');
  assert.equal(config.domain, 'mg.example.com');
  assert.equal(config.region, 'eu');
  assert.equal(config.html_format, false);
  assert.equal(config.max_emails_per_hour, 1000, 'clamped to the manifest max');
  assert.equal(config.auto_register_webhooks, false);
  assert.equal(config.from, '"Gladys" <gladys@mg.example.com>');
});

test('an unknown region falls back to US, an empty cap to the default', () => {
  const config = normalizeConfig({ region: 'asia', max_emails_per_hour: '' });
  assert.equal(config.region, 'us');
  assert.equal(config.max_emails_per_hour, 60);
});

test('the domain loses scheme, path and trailing dot', () => {
  assert.equal(normalizeDomain('http://mg.example.com/path?x=1'), 'mg.example.com');
  assert.equal(normalizeDomain('mg.example.com.'), 'mg.example.com');
});

test('the sender name cannot break out of the From header', () => {
  const from = formatFrom({
    sender_name: 'Home"\r\nBcc: evil@x.com <',
    sender_address: 'home@mg.example.com',
    domain: 'mg.example.com',
  });
  assert.equal(from, '"HomeBcc: evil@x.com" <home@mg.example.com>');
  assert.ok(!/[\r\n]/.test(from));
});

test('a sender address typed by hand wins over the default one', () => {
  const config = normalizeConfig({
    api_key: 'k',
    domain: 'mg.example.com',
    sender_name: '',
    sender_address: 'alerts@mg.example.com',
  });
  assert.equal(config.from, '"Gladys" <alerts@mg.example.com>');
});
