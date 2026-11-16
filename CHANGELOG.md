# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.0.3] - 2026-11-16

- Maintenance release, no functional change.

## [0.0.2] - 2026-11-16

- Update `@gladysassistant/integration-sdk` to 0.16.1 (security update).

## [0.0.1] - 2026-11-15

### Added

- Mailgun notification channel: each Gladys user enters their email address and receives the
  Gladys notifications by email, the camera image included.
- Configuration: API key, sending domain, US or EU region, sender, notification subject, HTML
  version, sending cap per hour, webhook signing key.
- Configuration buttons: test the connection, send a test email, register the Mailgun webhooks.
- Scene action "Send an email" (to, subject, message, cc, bcc, reply to, tags), returning `sent`,
  `message_id` and `error`.
- Scene triggers from the Mailgun events relayed by Gladys Plus: email delivered, failed, opened,
  clicked, reported as spam, unsubscribed. Signed events are checked with the webhook signing key;
  replays and duplicates are dropped.
- The Gladys Plus URL is registered on the Mailgun webhooks of the domain automatically, next to
  the URLs already there, and replaced when it changes.
- Dashboard widgets "Mailgun activity" (figures, chart, domain and webhook status, test email) and
  "Mailgun events" (last events received).
- English, French, German and Spanish everywhere: manifest, messages, widgets, documentation.
- CI (format, lint, tests on Node 22 and 24, store checks, Docker build), Release workflow,
  multi-arch image build, GitHub Releases, Dependabot.
- `SECURITY.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-mailgun/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/prohand/gladys-mailgun/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/prohand/gladys-mailgun/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/prohand/gladys-mailgun/releases/tag/v0.0.1
