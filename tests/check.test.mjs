#!/usr/bin/env node
// Fixture tests for `solid2-kit check`. Exit 0 only when clean fixtures pass
// and every expected violation id is reported on the violations fixtures.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const kit = join(root, 'bin/solid2-kit.mjs');

function runCheck(fixtureDir) {
  return spawnSync(process.execPath, [kit, 'check', '--target', fixtureDir, '--dir', '.'], {
    encoding: 'utf8',
  });
}

function fail(message, result) {
  console.error(message);
  if (result.stdout) console.error(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

const clean = runCheck(join(root, 'tests/fixtures/clean'));
if (clean.status !== 0) {
  fail('expected clean fixtures to pass `solid2-kit check`', clean);
}

const violations = runCheck(join(root, 'tests/fixtures/violations'));
if (violations.status === 0) {
  fail('expected violation fixtures to fail `solid2-kit check`', violations);
}

const output = `${violations.stdout}\n${violations.stderr}`;
const found = new Set([...output.matchAll(/\[([a-z0-9-]+)\]/g)].map((match) => match[1]));
const expected = [
  'react-import',
  'react-lazy',
  'react-jsx-prop',
  'solid1-api',
  'solid1-jsx-namespace',
  'solid1-router',
  'meta-provider',
  'vite-plugin-solid',
  'jsx-accessor-map',
  'for-each-map',
  'props-rest-copy',
  'lazy-then-wrapper',
  'dangerously-set-inner-html',
  'setter-as-handler',
  'react-hook',
  'solidstart-import',
  'solidstart-api',
  'use-client',
  'next-import',
  'render-jsx-element',
];
const missing = expected.filter((id) => !found.has(id));
if (missing.length > 0) {
  fail(`violation fixtures did not report: ${missing.join(', ')}`, violations);
}

// .jsx sources are gated like .tsx ones.
if (!output.includes('legacy.jsx')) {
  fail('expected violations in the .jsx fixture to be reported', violations);
}

// Explicit file mode: `check [files...]` gates only the named sources.
const singleBad = spawnSync(
  process.execPath,
  [kit, 'check', join(root, 'tests/fixtures/violations/bad.tsx')],
  { encoding: 'utf8' },
);
if (singleBad.status !== 1 || !singleBad.stderr.includes('[react-import]')) {
  fail('expected file-mode check to fail on the violations fixture', singleBad);
}
const singleClean = spawnSync(
  process.execPath,
  [kit, 'check', join(root, 'tests/fixtures/clean/app.tsx')],
  { encoding: 'utf8' },
);
if (singleClean.status !== 0) {
  fail('expected file-mode check to pass on a clean fixture', singleClean);
}

console.log(`check fixtures — OK (clean passed; violations reported ${expected.join(', ')}; file mode gated a single file)`);
