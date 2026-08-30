#!/usr/bin/env node
// Fixture tests for `solid2-kit doctor`. Exit 0 only when the clean project
// fixture passes and every expected wiring finding is reported on the bad one.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const kit = join(root, 'bin/solid2-kit.mjs');

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

console.log(`doctor fixtures — OK (clean passed; bad reported ${expected.join(', ')})`);
