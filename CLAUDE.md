# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human contributors.

## What this is

A Gladys Assistant **external integration** for **Mailgun** (Node 22+, ESM, no build step, one
runtime dependency: `@gladysassistant/integration-sdk`). It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js) and follows
the layout and workflows of [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel).

Manifest `type: "communication"`, **send-only** (`messaging.receive: false`): each Gladys user
enters their email address (`contact_schema`) and Gladys hands the notifications to
`onSendMessage`. On top: a scene action (`send_email`), six scene triggers fired by the Mailgun
webhooks relayed by Gladys Plus, two dashboard widgets (`activity`, `events`), three
Configuration buttons. Tagged `transports: ["cloud"]`. Requires Gladys 5.3+ (`keywords`).

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/app.test.js                # one file
node --test --test-name-pattern "signed"    # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24; pull requests also run the store checks
and a Docker build. Releases: **Actions → Release** only (bumps `package.json`, manifest
`version` + `docker_image`, rolls `CHANGELOG.md`, tags, builds, publishes the GitHub Release).

## Architecture

```
index.js                     creates the SDK instance, calls createApp, connects
src/app.js                   every handler: messaging, actions, scenes, widgets, webhooks, status
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js                  LANGUAGES = en, fr, de, es; pick / localize
src/state.js                 /data/mailgun-state.json: last events, send times, webhook URL
src/mailgun/client.js        Mailgun HTTP API (send, domain, webhooks, metrics, stats), injected fetch
src/mailgun/message.js       recipients, header sanitizing, text -> HTML, inline camera image
src/mailgun/errors.js        MailgunError / SendLimitError / InvalidInputError + translated texts
src/mailgun/connection.js    "Test the connection" and the connection status
src/mailgun/events.js        Mailgun event -> scene trigger key + flat scene data
src/mailgun/signature.js     HMAC-SHA256 webhook signature, max age, replay protection
src/mailgun/webhooks.js      register / unregister the Gladys Plus URL (3 URLs max per event)
src/mailgun/stats.js         Metrics API, Stats API fallback, 5-minute cache
src/mailgun/limiter.js       sending cap per sliding hour
src/capabilities/scenes.js   scene action `send_email`
src/capabilities/widgets.js  widgets `activity` and `events`
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys (mandatory)
test/                        node --test against the SDK fake Gladys + test/helpers/fakeMailgun.js
```

## Rules

- **Keys are forever.** Config keys, `contact_schema` keys, action, webhook, scene trigger, scene
  action, output, variable and widget keys are stored by users (configs, scenes, dashboards) or
  by Mailgun (the webhook URL ends with the webhook key). Never rename them.
- **Secrets.** The API key and the signing key travel in the Authorization header / HMAC only:
  never logged, never in a URL, never in an error message, never in `/data`. Email addresses are
  masked in the logs (`maskEmail`).
- **Untrusted input.** Scene fields and notification texts end up in email headers: go through
  `parseRecipients`, `headerValue`, `parseTags`, `escapeHtml`. Webhook bodies are verified
  (signature when the key is set) and reduced to the declared keys (`sceneEventData`).
- **No loops.** A scene action never fires a scene trigger. The sending cap
  (`max_emails_per_hour`) counts recipients and survives restarts.
- **The container rootfs is read-only.** Write only under `/data` (`DATA_DIR` in tests).
- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or in the
  manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`
  (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version heading.
- **Manifest.** Every text is `{ en, fr, de, es }` — `label`, `description`, `placeholder` alike.
  The catalog `description` holds 10 to 100 characters per language. `test/manifest.test.js` ties
  the manifest to the code (defaults, handlers, trigger data, widget settings, languages): change
  both sides together.
- **User-facing text** is written in the four languages: action messages, widget texts, errors,
  and `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English. Tests
  never touch the network: use `createFakeMailgun()` and `startApp()` from `test/helpers/`.
