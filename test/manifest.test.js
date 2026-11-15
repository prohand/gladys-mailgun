// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest shape, but nothing there can know
// which handlers the code registers, nor which keys it reads: these tests keep
// both sides in sync, and catch the store rules that are easiest to miss.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { ACTIONS, WEBHOOK_KEY } from '../src/app.js';
import { SCENE_TRIGGERS, SEVERITIES, sceneEventData, toEmailEvent } from '../src/mailgun/events.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import { WIDGETS } from '../src/capabilities/widgets.js';
import { PERIODS, DEFAULT_PERIOD } from '../src/mailgun/stats.js';
import { mailgunEvent } from './helpers/signing.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

test('version, package.json and image tag agree', () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, pkg.version, 'manifest version = package.json version');
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-mailgun:${manifest.version}`);
});

test('a send-only notification channel, tagged cloud', () => {
  assert.equal(manifest.type, 'communication');
  assert.deepEqual(manifest.messaging, { receive: false });
  assert.deepEqual(manifest.transports, ['cloud'], 'Mailgun is a cloud service');
  assert.deepEqual(
    manifest.contact_schema.map((field) => field.key),
    ['email'],
  );
  assert.match(appSource, /contact\?\.email/);
});

test('every manifest action, webhook, scene action and widget is handled', () => {
  assert.deepEqual(
    manifest.actions.map((action) => action.key).sort(),
    Object.values(ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.webhooks.map((webhook) => webhook.key),
    [WEBHOOK_KEY],
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(appSource, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(appSource, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  for (const key of Object.keys(WIDGETS)) {
    assert.match(appSource, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
});

test('the scene triggers the code fires are the ones the manifest declares', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  const severity = manifest.scene_triggers
    .find((trigger) => trigger.key === SCENE_TRIGGERS.FAILED)
    .fields.find((field) => field.key === 'severity');
  assert.deepEqual(severity.options.map((option) => option.value).sort(), [...SEVERITIES].sort());
});

test('the scene event data holds exactly the declared fields and variables', () => {
  const names = {
    email_delivered: 'delivered',
    email_failed: 'failed',
    email_opened: 'opened',
    email_clicked: 'clicked',
    email_complained: 'complained',
    email_unsubscribed: 'unsubscribed',
  };
  for (const trigger of manifest.scene_triggers) {
    const declared = new Set([
      ...trigger.fields.map((field) => field.key),
      ...trigger.variables.map((variable) => variable.key),
    ]);
    const data = sceneEventData(toEmailEvent({ 'event-data': mailgunEvent(names[trigger.key]) }));
    assert.deepEqual(Object.keys(data).sort(), [...declared].sort(), trigger.key);
  }
});

test('the scene action outputs are the declared ones', () => {
  const action = manifest.scene_actions.find((entry) => entry.key === SCENE_ACTIONS.SEND_EMAIL);
  assert.deepEqual(action.outputs.map((output) => output.key).sort(), [
    'error',
    'message_id',
    'sent',
  ]);
});

test('the widget settings match the code', () => {
  const period = manifest.widgets
    .find((widget) => widget.key === WIDGETS.ACTIVITY)
    .settings.find((setting) => setting.key === 'period');
  assert.deepEqual(
    period.options.map((option) => option.value).sort(),
    Object.keys(PERIODS).sort(),
  );
  assert.equal(period.default, DEFAULT_PERIOD);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.ok(!(field.key in DEFAULT_CONFIG), `section ${field.key} stores no value`);
      assert.equal(field.default, undefined);
      assert.equal(field.required, undefined);
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `config key "${field.key}" missing in DEFAULT_CONFIG`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
    }
  }
});

test('secrets are secret fields and never have a default', () => {
  for (const key of ['api_key', 'webhook_signing_key']) {
    const field = manifest.config_schema.find((entry) => entry.key === key);
    assert.equal(field.type, 'secret', key);
    assert.equal(field.default, undefined, key);
  }
});

const FIELD_TYPES = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'section'];

test('every field uses a type, key and placeholder the store accepts', () => {
  const allFields = [
    ...manifest.config_schema,
    ...manifest.contact_schema,
    ...manifest.actions.flatMap((action) => action.fields ?? []),
    ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
    ...manifest.scene_triggers.flatMap((trigger) => trigger.fields ?? []),
    ...manifest.scene_actions.flatMap((action) => action.fields ?? []),
  ];
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `field "${field.key}": type "${field.type}"`);
    assert.match(field.key, /^[a-z0-9_]+$/);
    if (field.placeholder !== undefined) {
      assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder object`);
      assert.ok(['string', 'number', 'secret'].includes(field.type));
    }
    if (field.min !== undefined || field.max !== undefined) {
      assert.equal(field.type, 'number');
    }
    for (const link of field.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
  for (const field of manifest.scene_triggers.flatMap((trigger) => trigger.fields)) {
    assert.ok(!['secret', 'boolean'].includes(field.type), 'no secret/boolean trigger filter');
  }
});

const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
];

test('catalog: name, categories and keywords follow the store rules', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(CATEGORIES.includes(category), category);
  }
  const keywords = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.ok(keywords.length >= 1 && keywords.length <= 10);
  assert.equal(new Set(keywords).size, keywords.length);
  for (const keyword of keywords) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword);
  }
  assert.equal(manifest.countries, undefined, 'Mailgun works worldwide');
  assert.match(manifest.cover_image, /^https:\/\//);
});

test('the Gladys floor covers every field the manifest declares', () => {
  // `categories` needs 4.86, widgets and scene declarations 5.1, `keywords` 5.3.
  const [major, minor] = manifest.gladys_version.replace(/^>=/, '').split('.').map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 3), manifest.gladys_version);
});

/** Every multi-language object of the manifest, with where it sits. */
function multiLanguageTexts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => multiLanguageTexts(child, `${path}[${index}]`));
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const keys = Object.keys(node);
  if (keys.includes('en') && keys.every((key) => /^[a-z]{2}$/.test(key))) {
    return [{ path, text: node }];
  }
  return keys.flatMap((key) => multiLanguageTexts(node[key], `${path}.${key}`));
}

test('every multi-language text carries en, fr, de and es', () => {
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 100, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}: languages`);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('the per-language length limits of the store hold', () => {
  const within = (text, min, max, where) => {
    for (const language of LANGUAGES) {
      const { length } = text[language];
      assert.ok(length >= min && length <= max, `${where}.${language}: ${length} characters`);
    }
  };
  within(manifest.description, 10, 100, 'description');
  for (const widget of manifest.widgets) {
    within(widget.label, 3, 30, `widget ${widget.key} label`);
    within(widget.description, 1, 100, `widget ${widget.key} description`);
  }
  for (const section of manifest.config_schema.filter((field) => field.type === 'section')) {
    within(section.description, 1, 1000, `section ${section.key}`);
  }
});

test('the documentation exists in the four languages', async () => {
  for (const language of LANGUAGES) {
    const text = await readFile(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
    assert.ok(text.length > 1000, `docs/${language}.md`);
    for (const key of Object.values(SCENE_TRIGGERS)) {
      assert.ok(text.includes(key), `docs/${language}.md mentions ${key}`);
    }
  }
});
