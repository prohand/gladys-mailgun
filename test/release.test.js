import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const BASE = `# Changelog

Describe changes under \`## [Unreleased]\`.

## [Unreleased]

### Added

- Something.

[Unreleased]: https://github.com/prohand/gladys-mailgun/commits/main
`;

test('the Unreleased section moves under the new version', () => {
  const rolled = rollChangelog(BASE, '1.0.0', '2026-11-15');
  assert.match(
    rolled,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-11-15\n\n### Added\n\n- Something\./,
  );
  assert.match(
    rolled,
    /\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-mailgun\/compare\/v1\.0\.0\.\.\.HEAD/,
  );
  assert.match(
    rolled,
    /\[1\.0\.0\]: https:\/\/github\.com\/prohand\/gladys-mailgun\/releases\/tag\/v1\.0\.0/,
  );
});

test('the next release compares with the previous tag, an empty section still gets a line', () => {
  const first = rollChangelog(BASE, '1.0.0', '2026-11-15');
  const second = rollChangelog(first, '1.0.1', '2026-11-20');
  assert.match(
    second,
    /## \[1\.0\.1\] - 2026-11-20\n\n- Maintenance release, no functional change\./,
  );
  assert.match(
    second,
    /\[1\.0\.1\]: https:\/\/github\.com\/prohand\/gladys-mailgun\/compare\/v1\.0\.0\.\.\.v1\.0\.1/,
  );
  assert.equal(rollChangelog(second, '1.0.1', '2026-11-21'), second, 'idempotent');
});
