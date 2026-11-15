# Mailgun for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that sends your Gladys
notifications by email through [Mailgun](https://www.mailgun.com/), adds a "Send an email" scene
action, starts scenes on Mailgun delivery events and shows the sending activity on the dashboard.

Built on [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
from the official [JavaScript template](https://github.com/GladysAssistant/integration-template-js).

- **Type**: `communication`, send-only notification channel (`messaging.receive: false`)
- **Transport**: `cloud` (Mailgun API, US or EU region)
- **Gladys**: 5.3.0 or later
- **Languages**: English, French, German, Spanish

User documentation: [English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) ·
[Español](docs/es.md)

## Features

| Surface               | What it does                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Notification channel  | Each user enters their email address ("My account"); Gladys notifications arrive by email, camera image included           |
| Configuration buttons | Test the connection · Send a test email · Register the Mailgun webhooks                                                    |
| Scene action          | `send_email`: to, subject, message, cc, bcc, reply to, tags → outputs `sent`, `message_id`, `error`                        |
| Scene triggers        | `email_delivered`, `email_failed`, `email_opened`, `email_clicked`, `email_complained`, `email_unsubscribed`               |
| Widget `activity`     | Sent / delivered / failed / opened over 24 h, 7 or 30 days, chart, domain + webhook status, sending cap, test email button |
| Widget `events`       | The last Mailgun events received, all or problems only                                                                     |
| Webhook (Gladys Plus) | `events`: Mailgun pushes its events, signatures checked with the signing key                                               |

Safety nets: a **sending cap** per hour (default 60) against scenes that loop, header sanitizing
of every value coming from users or scenes, HMAC signature check with replay protection on the
webhooks, the API key never logged.

## Project structure

```
.
├─ index.js                          # SDK bootstrap: createApp + connect
├─ src/
│  ├─ app.js                         # every handler (messaging, actions, scenes, widgets, webhook)
│  ├─ config.js                      # defaults (mirror the manifest) + normalization
│  ├─ i18n.js                        # en / fr / de / es
│  ├─ state.js                       # /data/mailgun-state.json
│  ├─ mailgun/                       # API client, messages, errors, events, signatures,
│  │                                 #   webhook registration, statistics, sending cap
│  └─ capabilities/                  # scene action + dashboard widgets
├─ docs/{en,fr,de,es}.md             # user documentation (linked from the Configuration screen)
├─ test/                             # node --test, fake Gladys (SDK) + fake Mailgun
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, non-root, read-only rootfs ready
├─ CHANGELOG.md                      # Keep a Changelog, rolled by the Release workflow
├─ CLAUDE.md                         # project rules for coding assistants & contributors
├─ SECURITY.md                       # how to report a vulnerability
├─ .github/workflows/ci.yml          # format, lint, tests (Node 22 + 24), store checks, Docker build
├─ .github/workflows/release.yml     # UI-driven release: bump + changelog + tag + build + store check
├─ .github/workflows/build.yml       # multi-arch image (amd64 + arm64) to ghcr.io
├─ .github/workflows/github-release.yml # GitHub Release of every version tag
├─ .github/scripts/changelog-release.mjs # moves [Unreleased] under the released version
└─ .github/dependabot.yml            # npm weekly, GitHub Actions and Docker monthly
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="mailgun" \
DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test: fake Gladys from the SDK + fake Mailgun, no network
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI runs the first three on Node 22 and 24 for every push and pull request; pull requests also
run the store checks (without the image check) and build the Docker image.

## Publish

1. Add the GitHub topic `gladys-assistant-integration` to the repository, and turn on **Private
   vulnerability reporting** (Settings → Security).
2. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
3. **Actions → Release → Run workflow** and pick `patch`, `minor` or `major` (the repository
   starts at `0.0.0`: pick `major` for `1.0.0`). The workflow bumps `package.json` and the
   manifest, rolls the changelog, tags `vX.Y.Z`, builds `ghcr.io/prohand/gladys-mailgun:X.Y.Z`
   (+ `latest`) for amd64 and arm64, publishes the GitHub Release and runs the store checks.
4. Make the GHCR package **public** the first time (Packages → gladys-mailgun → Package
   settings), so Gladys can pull it.
5. The store indexer picks up the new version and Gladys offers the install / update.

## License

Apache-2.0
