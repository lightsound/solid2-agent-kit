#!/usr/bin/env node
// Tests for check:upstream's version selection: semver prerelease precedence
// (it decides "newer than baseline") and the in-major pick over dist-tags.

import { compareVersions, newestOnLine, parseVersion } from '../scripts/upstream-probes/versions.mjs';
import { WATCHED } from '../scripts/upstream-probes/registry.mjs';

const failures = [];

const ordered = [
  '1.9.15',
  '2.0.0-1',
  '2.0.0-beta.1',
  '2.0.0-next.27',
  '2.0.0-rc',
  '2.0.0-rc.0',
  '2.0.0-rc.9',
  '2.0.0-rc.9.1',
  '2.0.0-rc.10',
  '2.0.0',
  '2.0.1-rc.0',
  '2.1.0',
];
for (let i = 0; i < ordered.length; i++) {
  for (let j = 0; j < ordered.length; j++) {
    const got = Math.sign(compareVersions(ordered[i], ordered[j]));
    const want = Math.sign(i - j);
    if (got !== want) failures.push(`compareVersions(${ordered[i]}, ${ordered[j]}) = ${got}, want ${want}`);
  }
}

// Dist-tags of the watched packages as published when the probes were added:
// the pick must skip other majors (`latest` on the Solid 1 lines) and take the
// newest tag even when `latest` is ahead of `next`.
const snapshot = [
  ['solid-js', 2, { beta: '1.10.0-beta.0', latest: '1.9.15', next: '2.0.0-rc.9' }, '2.0.0-rc.9'],
  ['@solidjs/web', 2, { latest: '2.0.0-rc.0', next: '2.0.0-rc.9' }, '2.0.0-rc.9'],
  ['@solidjs/signals', 2, { latest: '2.0.0-rc.0', next: '2.0.0-rc.9' }, '2.0.0-rc.9'],
  ['@solidjs/diagnostics', 2, { latest: '2.0.0-rc.2', next: '2.0.0-rc.9' }, '2.0.0-rc.9'],
  ['@solidjs/router', 2, { beta: '0.10.0-beta.9', latest: '1.0.0', next: '2.0.0-next.27' }, '2.0.0-next.27'],
  ['@solidjs/vite-plugin', 3, { next: '3.0.0-next.35', latest: '3.0.0-next.44' }, '3.0.0-next.44'],
  ['@solidjs/testing-library', 1, { latest: '0.8.10', next: '1.0.0-beta.3' }, '1.0.0-beta.3'],
];
for (const [name, line, tags, want] of snapshot) {
  const got = newestOnLine(tags, line);
  if (got !== want) failures.push(`newestOnLine(${name}, ${line}) = ${got}, want ${want}`);
}
for (const name of Object.keys(WATCHED)) {
  if (!snapshot.some(([n, line]) => n === name && line === WATCHED[name].line)) {
    failures.push(`${name} (line ${WATCHED[name].line}) is watched but not in the dist-tag snapshot`);
  }
  if (parseVersion(WATCHED[name].baseline).core[0] !== WATCHED[name].line) {
    failures.push(`${name}: baseline ${WATCHED[name].baseline} is not on line ${WATCHED[name].line}`);
  }
}
if (newestOnLine({ latest: '1.9.15' }, 2) !== null) failures.push('newestOnLine must return null when no tag is on the line');

if (failures.length > 0) {
  console.error(`upstream — ${failures.length} failure(s):\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('upstream — OK (semver prerelease precedence, newest dist-tag per watched major)');
