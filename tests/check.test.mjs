#!/usr/bin/env node
// Fixture tests for `solid2-kit check`. Exit 0 only when clean fixtures pass
// and every expected violation id is reported on the violations fixtures.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  'typeof-window',
  'next-nav',
  'react-dom-event',
  'history-nav',
  'pending-accessor-call',
  'dynamic-jsx',
  'jsx-namespace-import',
  'effect-sync-signal',
  'action-plain-async',
  'store-setter-async',
];
const missing = expected.filter((id) => !found.has(id));
if (missing.length > 0) {
  fail(`violation fixtures did not report: ${missing.join(', ')}`, violations);
}

// .jsx sources are gated like .tsx ones.
if (!output.includes('legacy.jsx')) {
  fail('expected violations in the .jsx fixture to be reported', violations);
}

// Both sole-setter apply shapes (block body with if-guard, expression body).
const effectSyncHits = [...output.matchAll(/effect-sync\.tsx:\d+ \[effect-sync-signal\]/g)].length;
if (effectSyncHits !== 2) {
  fail(`expected 2 effect-sync-signal findings in effect-sync.tsx, saw ${effectSyncHits}`, violations);
}

// Both store families (createStore, createOptimisticStore); the clean fixture's
// async signal setter and external set*(async …) call must stay silent.
const storeAsyncHits = [...output.matchAll(/store-async\.tsx:\d+ \[store-setter-async\]/g)].length;
if (storeAsyncHits !== 2) {
  fail(`expected 2 store-setter-async findings in store-async.tsx, saw ${storeAsyncHits}`, violations);
}

// TanStack Router imports exempt only the names they bind (the clean
// fixture's useRouter()/notFound()/<Navigate> pass); Router 1.x <Navigate>,
// an aliased-away useRouter(), and an unimported notFound() are still caught.
const routerScopeHits = [...output.matchAll(/router-scope\.tsx:\d+ \[(?:next-nav|solid1-router)\]/g)].length;
if (routerScopeHits !== 3) {
  fail(`expected 3 next-nav/solid1-router findings in router-scope.tsx, saw ${routerScopeHits}`, violations);
}

// Explicit file mode: `check [paths...]` gates only the named sources.
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

// A directory passed positionally (`check src`) is walked, not filtered out.
const runPaths = (cwd, ...paths) =>
  spawnSync(process.execPath, [kit, 'check', ...paths], { cwd, encoding: 'utf8' });
const dirBad = runPaths(join(root, 'tests/fixtures'), 'violations');
if (dirBad.status !== 1 || !dirBad.stderr.includes('[react-import]')) {
  fail('expected `check violations` (directory argument) to fail with findings', dirBad);
}
const cleanCount = readdirSync(join(root, 'tests/fixtures/clean')).length;
const dirClean = runPaths(join(root, 'tests/fixtures'), 'clean');
if (dirClean.status !== 0 || !dirClean.stdout.includes(`(${cleanCount} files scanned)`)) {
  fail(`expected \`check clean\` (directory argument) to pass with ${cleanCount} files scanned`, dirClean);
}

// A walk that finds no sources must not pass, and a missing path that may
// name a directory (no extension, or a trailing slash) is an error.
// node_modules and dot-directories are never walked. Named files with no
// sources among them (a docs-only changed-file list) pass with nothing to check.
const scratch = mkdtempSync(join(tmpdir(), 'solid2-kit-check-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));
mkdirSync(join(scratch, 'src/node_modules/react'), { recursive: true });
mkdirSync(join(scratch, 'src/.cache'), { recursive: true });
writeFileSync(join(scratch, 'src/node_modules/react/index.tsx'), "import React from 'react';\n");
writeFileSync(join(scratch, 'src/.cache/app.tsx'), "import React from 'react';\n");
writeFileSync(join(scratch, 'src/notes.md'), '# notes\n');
for (const [label, result] of [
  ['default --dir src with no sources', runPaths(scratch)],
  ['directory argument with no sources', runPaths(scratch, 'src')],
  ['directory argument with no sources next to a non-source file', runPaths(scratch, 'src', 'src/notes.md')],
]) {
  if (result.status !== 2 || !result.stderr.includes('nothing was checked')) {
    fail(`expected a 0-file walk (${label}) to exit 2 with "nothing was checked"`, result);
  }
}
const docsOnly = runPaths(scratch, 'src/notes.md');
if (docsOnly.status !== 0 || !docsOnly.stdout.includes('nothing to check')) {
  fail('expected named non-source files only to pass with "nothing to check"', docsOnly);
}
for (const [label, result] of [
  ['an extensionless path (typo\'d directory)', runPaths(scratch, 'does-not-exist')],
  ['a slash-terminated path', runPaths(scratch, 'lib.old/')],
  ['a typo\'d directory next to deleted files', runPaths(scratch, 'srcc', 'src/gone.tsx', 'README.md')],
]) {
  if (result.status !== 2 || !result.stderr.includes('path not found')) {
    fail(`expected ${label} that does not exist to exit 2 with "path not found"`, result);
  }
}

// `git diff --name-only | xargs solid2-kit check` names deleted files: a
// missing path with an extension (or a dot-name) is skipped, so a delete-only
// change passes and deleted paths never mask findings in surviving files.
writeFileSync(join(scratch, 'src/keep.tsx'), 'export const keep = () => <p>ok</p>;\n');
writeFileSync(join(scratch, 'src/bad.tsx'), "import React from 'react';\n");
const deleted = ['src/gone.tsx', 'docs/removed.md', '.eslintrc'];
const deleteOnly = runPaths(scratch, ...deleted);
if (deleteOnly.status !== 0 || !deleteOnly.stdout.includes('nothing to check')) {
  fail('expected a delete-only changed-file list to pass with "nothing to check"', deleteOnly);
}
const deletedAndClean = runPaths(scratch, 'src/keep.tsx', ...deleted);
if (deletedAndClean.status !== 0 || !deletedAndClean.stdout.includes('(1 files scanned)')) {
  fail('expected deleted files next to a clean survivor to pass with 1 file scanned', deletedAndClean);
}
const deletedAndBad = runPaths(scratch, 'src/bad.tsx', ...deleted);
if (deletedAndBad.status !== 1 || !deletedAndBad.stderr.includes('[react-import]')) {
  fail('expected deleted files next to a violating survivor to still fail with findings', deletedAndBad);
}

console.log(
  `check fixtures — OK (clean passed; violations reported ${expected.join(', ')}; TanStack Router names exempt only when imported; file mode gated a single file; directory arguments walked; 0-file walks and missing directory-like paths fail; docs- and delete-only file lists pass)`,
);
