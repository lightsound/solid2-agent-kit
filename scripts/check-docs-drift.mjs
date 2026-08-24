#!/usr/bin/env node
// Docs-drift guard: verifies every Solid 2.0 API this kit recommends still
// exists in the official documentation corpus (llms-full.txt). Solid 2.0 is
// young; if the docs rename or remove an API, this check fails so the kit
// content gets updated instead of teaching agents stale names.
//
// Run: node scripts/check-docs-drift.mjs (also run weekly by CI)

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CORPUS_URL = 'https://v2-rebuild--solid-docs-v2.netlify.app/llms-full.txt';

// Non-create* APIs the kit content recommends. create* primitives are
// auto-extracted from files/ below, so only list the rest here.
const REQUIRED_APIS = [
  // components / boundaries
  'Show',
  'For',
  'Repeat',
  'Loading',
  'Errored',
  'Reveal',
  'Switch',
  'Match',
  'Portal',
  'Dynamic',
  // reactivity / lifecycle
  'onSettled',
  'onCleanup',
  'isPending',
  'latest',
  'flush',
  'untrack',
  'action',
  'affects',
  'refresh',
  'resolve',
  // stores
  'reconcile',
  'merge',
  'omit',
  'snapshot',
  'deep',
  'storePath',
  // context / rendering
  'useContext',
  'render',
  'hydrate',
];

// Solid 1.x names that appear in kit content only as banned examples.
const BANNED_CREATE = new Set([
  'createResource',
  'createMutable',
  'createComputed',
  'createSelector',
  'createDeferred',
]);

// User-defined custom primitives that appear in kit examples (idiomatically
// named create*) but are not Solid APIs.
const EXAMPLE_CREATE = new Set(['createSubscriptionQuery']);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function extractCreateApis() {
  const found = new Set();
  for (const file of walk(join(KIT_ROOT, 'files'))) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(/\bcreate[A-Z]\w+/g)) {
      if (!BANNED_CREATE.has(match[0]) && !EXAMPLE_CREATE.has(match[0])) found.add(match[0]);
    }
  }
  return [...found].sort();
}

const response = await fetch(CORPUS_URL);
if (!response.ok) {
  console.error(`docs-drift — failed to fetch corpus: ${response.status} ${CORPUS_URL}`);
  process.exit(2);
}
const corpus = await response.text();
if (corpus.length < 10_000) {
  console.error(`docs-drift — corpus suspiciously small (${corpus.length} bytes); mirror may have moved.`);
  process.exit(2);
}

const createApis = extractCreateApis();
const allApis = [...new Set([...createApis, ...REQUIRED_APIS])].sort();

// Require a code-like occurrence, not a prose word: several APIs are common
// English words (merge, action, deep, latest, resolve, render, flush) and a
// plain \b word \b test would keep passing on prose even after the API was
// removed from the docs. Accepted contexts: backticked (`name`), an import
// or JSX position ({ name, <name), or a call (name().
function appearsAsCode(name) {
  return new RegExp(`[\`{,<]\\s*${name}\\b|\\b${name}\\s*\\(`).test(corpus);
}

const missing = allApis.filter((name) => !appearsAsCode(name));

if (missing.length > 0) {
  console.error('docs-drift — APIs referenced by this kit are missing from the official Solid 2.0 corpus:');
  for (const name of missing) console.error(`  - ${name}`);
  console.error('\nThe docs may have renamed or removed them. Update files/ (rules, skill) accordingly.');
  process.exit(1);
}

console.log(
  `docs-drift — OK: ${allApis.length} APIs (${createApis.length} auto-extracted create*) all present in corpus (${(corpus.length / 1024).toFixed(0)} KiB).`,
);
