#!/usr/bin/env node
// Fixture tests for `solid2-kit doctor`. Exit 0 only when the clean project
// fixture passes, every expected wiring finding is reported on the bad one,
// and a freshly synced project (guidance files carrying the current version
// marker, sentence punctuation included) is not flagged as stale-guidance.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const kit = join(root, 'bin/solid2-kit.mjs');
const VERSION = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

function runDoctor(fixtureDir) {
  return spawnSync(process.execPath, [kit, 'doctor', '--target', fixtureDir], { encoding: 'utf8' });
}

function fail(message, result) {
  console.error(message);
  if (result.stdout) console.error(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

const clean = runDoctor(join(root, 'tests/fixtures/doctor/clean'));
if (clean.status !== 0) {
  fail('expected clean doctor fixture to pass `solid2-kit doctor`', clean);
}

const bad = runDoctor(join(root, 'tests/fixtures/doctor/bad'));
if (bad.status === 0) {
  fail('expected bad doctor fixture to fail `solid2-kit doctor`', bad);
}

const found = new Set([...bad.stderr.matchAll(/\[([a-z0-9-]+)\]/g)].map((match) => match[1]));
const expected = [
  'dep-react',
  'dep-vite-plugin-solid',
  'dep-eslint-plugin-solid',
  'solid-js-version',
  'tsconfig-jsx',
  'tsconfig-jsx-import-source',
  'config-vite-plugin-solid',
  'eslint-plugin-solid',
  'stale-guidance',
];
const missing = expected.filter((id) => !found.has(id));
if (missing.length > 0) {
  fail(`bad doctor fixture did not report: ${missing.join(', ')}`, bad);
}

// The clean fixture has no guidance files, which is exactly how the v0.8.0
// stale-guidance false positive slipped through: the marker sentence ends
// with a period right after the version ("… v0.8.0. Do not edit …"), and the
// extraction regex swallowed it. Run a real `sync` and require doctor to
// pass on the result.
const synced = mkdtempSync(join(tmpdir(), 'solid2-kit-doctor-'));
process.on('exit', () => rmSync(synced, { recursive: true, force: true }));
writeFileSync(
  join(synced, 'package.json'),
  JSON.stringify({ name: 'consumer', devDependencies: { 'solid-js': '^2.0.0' } }, null, 2),
);
const sync = spawnSync(process.execPath, [kit, 'sync', '--no-hooks', '--target', synced], {
  encoding: 'utf8',
});
if (sync.status !== 0) fail('sync into the doctor temp fixture failed', sync);
const freshlySynced = runDoctor(synced);
if (freshlySynced.status !== 0) {
  fail('expected a freshly synced project to pass `solid2-kit doctor` (stale-guidance false positive)', freshlySynced);
}

// Version sentences wrapped in markdown emphasis with trailing punctuation
// must not have the punctuation eaten into the extracted version either.
writeFileSync(
  join(synced, 'AGENTS.md'),
  `# AGENTS.md\n\nGuidance managed by **solid2-agent-kit v${VERSION}**.\n`,
);
const boldMarker = runDoctor(synced);
if (boldMarker.status !== 0) {
  fail('expected a bold current-version marker with trailing punctuation to pass doctor', boldMarker);
}

// A genuinely stale version in the same sentence shape must still be caught.
writeFileSync(
  join(synced, 'AGENTS.md'),
  '# AGENTS.md\n\n<!-- Managed by solid2-agent-kit v0.0.1. Do not edit inside this block; run `solid2-kit sync` to update. -->\n',
);
const stale = runDoctor(synced);
if (stale.status === 0 || !stale.stderr.includes('[stale-guidance]') || !stale.stderr.includes('v0.0.1 ')) {
  fail('expected a genuinely stale guidance version to fail doctor with stale-guidance', stale);
}

console.log(`doctor fixtures — OK (clean passed; bad reported ${expected.join(', ')}; freshly synced guidance not flagged stale; stale version still caught)`);
