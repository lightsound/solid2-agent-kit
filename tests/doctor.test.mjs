#!/usr/bin/env node
// Fixture tests for `solid2-kit doctor`. Exit 0 only when the clean project
// fixture passes, every expected wiring finding is reported on the bad one,
// and a freshly synced project (guidance files carrying the current version
// marker, sentence punctuation included) is not flagged as stale-guidance.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  'router-version',
  'meta-version',
  'tanstack-router-version',
  'tanstack-query-version',
  'testing-library-version',
  'web-version',
  'signals-version',
  'diagnostics-version',
  'vite-plugin-version',
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

// A dist-tag range ("latest") only shows its line once installed. Since the
// 2.0.0 release npm's `latest` for @solidjs/router is the 2.x line itself,
// but an installed 1.0.0 (an old lockfile, the `v1-latest` tag) is still the
// Solid 1 line, and the last prerelease (2.0.0-next.44) is now below the
// kit's baseline floor.
const tagged = mkdtempSync(join(tmpdir(), 'solid2-kit-doctor-tag-'));
process.on('exit', () => rmSync(tagged, { recursive: true, force: true }));
writeFileSync(
  join(tagged, 'package.json'),
  JSON.stringify({ name: 'consumer', dependencies: { 'solid-js': 'next', '@solidjs/router': 'latest' } }, null, 2),
);
const installRouter = (version) => {
  mkdirSync(join(tagged, 'node_modules/@solidjs/router'), { recursive: true });
  writeFileSync(
    join(tagged, 'node_modules/@solidjs/router/package.json'),
    JSON.stringify({ name: '@solidjs/router', version }),
  );
};
const notInstalled = runDoctor(tagged);
if (notInstalled.status !== 0) {
  fail('expected an unresolved dist-tag range to pass doctor until it is installed', notInstalled);
}
installRouter('1.0.0');
const oldRouter = runDoctor(tagged);
if (oldRouter.status === 0 || !oldRouter.stderr.includes('[router-version] node_modules has @solidjs/router 1.0.0')) {
  fail('expected an installed @solidjs/router 1.0.0 (the Solid 1 line) to fail doctor with router-version', oldRouter);
}
installRouter('2.0.0-next.44');
const prereleaseRouter = runDoctor(tagged);
if (prereleaseRouter.status === 0 || !prereleaseRouter.stderr.includes('[router-version] node_modules has @solidjs/router 2.0.0-next.44')) {
  fail('expected an installed @solidjs/router 2.0.0-next.44 (below the 2.0.0 baseline) to fail doctor with router-version', prereleaseRouter);
}
installRouter('2.0.0');
const stableRouter = runDoctor(tagged);
if (stableRouter.status !== 0) {
  fail('expected @solidjs/router installed from `latest` (2.0.0) to pass doctor', stableRouter);
}

// TanStack Router's `latest` is 1.x (solid-js ^1.9 peer); the Solid 2 line is
// 2.0.0-rc.x on `rc`. `check` exempts its useRouter/notFound/<Navigate> in
// every major, so doctor is the gate that sees a 1.x install. TanStack Query
// (`latest` 5.x, solid-js ^1.6 peer; 6.0.0-rc.x on `rc`) and Testing Library
// (`latest` 0.8.x on solid-js/web; 1.0.0-rc.x on `next`) have the same shape.
const lineScratch = mkdtempSync(join(tmpdir(), 'solid2-kit-doctor-line-'));
process.on('exit', () => rmSync(lineScratch, { recursive: true, force: true }));
const lineRun = (name, range, installed) => {
  writeFileSync(
    join(lineScratch, 'package.json'),
    JSON.stringify({ name: 'consumer', dependencies: { 'solid-js': 'next', [name]: range } }, null, 2),
  );
  rmSync(join(lineScratch, 'node_modules'), { recursive: true, force: true });
  if (installed) {
    mkdirSync(join(lineScratch, 'node_modules', name), { recursive: true });
    writeFileSync(join(lineScratch, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: installed }));
  }
  return runDoctor(lineScratch);
};
for (const { name, id, bad, good } of [
  {
    name: '@tanstack/solid-router',
    id: 'tanstack-router-version',
    bad: [
      ['latest', '1.170.36', 'installed from `latest`'],
      ['^1.170.36', undefined, 'declared ^1.170.36'],
      ['~1', undefined, 'declared ~1'],
    ],
    good: [
      ['rc', '2.0.0-rc.8', 'installed from `rc`'],
      ['^2.0.0-rc.8', undefined, 'declared ^2.0.0-rc.8'],
    ],
  },
  {
    name: '@tanstack/solid-query',
    id: 'tanstack-query-version',
    bad: [
      ['latest', '5.103.2', 'installed from `latest`'],
      ['^5.103.2', undefined, 'declared ^5.103.2'],
      ['^4', undefined, 'declared ^4'],
    ],
    good: [
      ['rc', '6.0.0-rc.4', 'installed from `rc`'],
      ['^6.0.0-rc.4', undefined, 'declared ^6.0.0-rc.4'],
    ],
  },
  {
    name: '@solidjs/testing-library',
    id: 'testing-library-version',
    bad: [
      ['latest', '0.8.10', 'installed from `latest`'],
      ['^0.8.10', undefined, 'declared ^0.8.10'],
      ['next', '1.0.0-beta.3', 'installed 1.0.0-beta.3 (the previous baseline)'],
      ['^1.0.0-beta.3', undefined, 'declared ^1.0.0-beta.3 (the previous baseline)'],
    ],
    good: [
      ['next', '1.0.0-rc.2', 'installed from `next`'],
      ['^1.0.0-rc.2', undefined, 'declared ^1.0.0-rc.2'],
      ['^1.0.0', undefined, 'declared ^1.0.0 (stable)'],
    ],
  },
  // Solid 2 prereleases older than the kit's baseline (bin/baseline.mjs):
  // the whole rc line (rc.0–rc.23, the previous baseline rc.21 included) is
  // below the 2.0.0 floor now, and @solidjs/vite-plugin's `next`
  // (3.0.0-next.35) trails its `latest`. The stable releases on `latest`
  // must pass.
  ...['@solidjs/web', '@solidjs/signals', '@solidjs/diagnostics'].map((name) => {
    const stale = name === '@solidjs/diagnostics' ? '2.0.0-rc.2' : '2.0.0-rc.0';
    return {
      name,
      id: `${name.replace('@solidjs/', '')}-version`,
      bad: [
        ['latest', stale, `installed from \`latest\` (${stale})`],
        [`^${stale}`, undefined, `declared ^${stale}`],
        [stale, undefined, `pinned ${stale}`],
        ['>=2.0.0-beta.1', undefined, 'declared >=2.0.0-beta.1'],
        ['latest', `${stale}+build.1`, `installed ${stale} with build metadata`],
        ['^2.0.0-rc.9', undefined, 'declared ^2.0.0-rc.9'],
        ['^2.0.0-rc.14', undefined, 'declared ^2.0.0-rc.14'],
        ['^2.0.0-rc.15', undefined, 'declared ^2.0.0-rc.15'],
        ['^2.0.0-rc.17', undefined, 'declared ^2.0.0-rc.17'],
        ['^2.0.0-rc.19', undefined, 'declared ^2.0.0-rc.19'],
        ['^2.0.0-rc.21', undefined, 'declared ^2.0.0-rc.21 (the previous baseline)'],
        ['next', '2.0.0-rc.23', 'installed from `next` (2.0.0-rc.23, the last prerelease)'],
      ],
      good: [
        ['latest', '2.0.0', 'installed from `latest` (the stable)'],
        ['^2.0.0', undefined, 'declared ^2.0.0'],
        ['latest', '2.0.0+build.1', 'installed 2.0.0 with build metadata'],
        ['*', undefined, 'declared * but not installed yet'],
      ],
    };
  }),
  {
    name: '@solidjs/vite-plugin',
    id: 'vite-plugin-version',
    bad: [
      ['next', '3.0.0-next.35', 'installed from `next` (3.0.0-next.35)'],
      ['^3.0.0-next.35', undefined, 'declared ^3.0.0-next.35'],
      ['^3.0.0-next.47', undefined, 'declared ^3.0.0-next.47'],
      ['^3.0.0-next.50', undefined, 'declared ^3.0.0-next.50'],
      ['^3.0.0-next.51', undefined, 'declared ^3.0.0-next.51'],
      ['^3.0.0-next.52', undefined, 'declared ^3.0.0-next.52 (the previous baseline)'],
    ],
    good: [
      ['latest', '3.0.0-next.57', 'installed from `latest`'],
      ['^3.0.0-next.57', undefined, 'declared ^3.0.0-next.57'],
      ['^3.0.0', undefined, 'declared ^3.0.0 (stable)'],
    ],
  },
  {
    name: 'solid-js',
    id: 'solid-js-version',
    bad: [
      ['^2.0.0-rc.0', undefined, 'declared ^2.0.0-rc.0'],
      ['^2.0.0-rc.9', undefined, 'declared ^2.0.0-rc.9'],
      ['^2.0.0-rc.14', undefined, 'declared ^2.0.0-rc.14'],
      ['^2.0.0-rc.15', undefined, 'declared ^2.0.0-rc.15'],
      ['^2.0.0-rc.17', undefined, 'declared ^2.0.0-rc.17'],
      ['^2.0.0-rc.19', undefined, 'declared ^2.0.0-rc.19'],
      ['^2.0.0-rc.21', undefined, 'declared ^2.0.0-rc.21 (the previous baseline)'],
      ['next', '2.0.0-beta.30', 'installed 2.0.0-beta.30'],
    ],
    good: [
      ['latest', '2.0.0', 'installed from `latest` (the stable)'],
      ['^2.0.0', undefined, 'declared ^2.0.0'],
    ],
  },
  {
    name: '@solidjs/router',
    id: 'router-version',
    bad: [
      ['^2.0.0-next.20', undefined, 'declared ^2.0.0-next.20'],
      ['^2.0.0-next.37', undefined, 'declared ^2.0.0-next.37'],
      ['^2.0.0-next.39', undefined, 'declared ^2.0.0-next.39'],
      ['^2.0.0-next.42', undefined, 'declared ^2.0.0-next.42'],
      ['^2.0.0-next.43', undefined, 'declared ^2.0.0-next.43'],
      ['^2.0.0-next.44', undefined, 'declared ^2.0.0-next.44 (the previous baseline)'],
    ],
    good: [
      ['latest', '2.0.0', 'installed from `latest` (the stable)'],
      ['^2.0.0', undefined, 'declared ^2.0.0'],
    ],
  },
]) {
  for (const [range, installed, label] of bad) {
    const result = lineRun(name, range, installed);
    if (result.status === 0 || !result.stderr.includes(`[${id}]`)) {
      fail(`expected ${name} ${label} to fail doctor with ${id}`, result);
    }
  }
  for (const [range, installed, label] of [...good, ['latest', undefined, 'declared `latest` but not installed yet']]) {
    const result = lineRun(name, range, installed);
    if (result.status !== 0) fail(`expected ${name} ${label} to pass doctor`, result);
  }
}

// The stale-baseline message names the package, what resolved, and the range to install.
const staleWeb = lineRun('@solidjs/web', 'latest', '2.0.0-rc.0');
if (
  !staleWeb.stderr.includes('[web-version] node_modules has @solidjs/web 2.0.0-rc.0 (package.json: "latest") — older than 2.0.0') ||
  !staleWeb.stderr.includes('Install @solidjs/web@^2.0.0.')
) {
  fail('expected the web-version finding to name the resolved rc and the baseline range to install', staleWeb);
}
const lowFloorWeb = lineRun('@solidjs/web', '^2.0.0-rc.0', '2.0.0-rc.16');
if (!lowFloorWeb.stderr.includes('[web-version] package.json pins @solidjs/web "^2.0.0-rc.0" — allows releases older than 2.0.0')) {
  fail('expected a declared range below the baseline to be reported as allowing older releases', lowFloorWeb);
}

// The JSX compilers come in through @solidjs/vite-plugin, undeclared; a
// lockfile can hold one below the baseline. Their own `latest` (2.0.0) and
// another major's copy are judged only when they are what node_modules has.
const transitive = mkdtempSync(join(tmpdir(), 'solid2-kit-doctor-transitive-'));
process.on('exit', () => rmSync(transitive, { recursive: true, force: true }));
writeFileSync(
  join(transitive, 'package.json'),
  JSON.stringify({ name: 'consumer', dependencies: { 'solid-js': 'next' }, devDependencies: { '@solidjs/vite-plugin': 'latest' } }, null, 2),
);
const transitiveRun = (name, installed) => {
  rmSync(join(transitive, 'node_modules'), { recursive: true, force: true });
  mkdirSync(join(transitive, 'node_modules', name), { recursive: true });
  writeFileSync(join(transitive, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: installed }));
  return runDoctor(transitive);
};
for (const [name, id] of [
  ['@solidjs/compiler', 'compiler-version'],
  ['@solidjs/babel-plugin', 'babel-plugin-version'],
]) {
  for (const oldVersion of ['2.0.0-rc.16', '2.0.0-rc.21']) {
    const old = transitiveRun(name, oldVersion);
    if (
      old.status === 0 ||
      !old.stderr.includes(`[${id}] node_modules has ${name} ${oldVersion} (not in package.json) — older than 2.0.0`) ||
      !old.stderr.includes(`npm update ${name}`)
    ) {
      fail(`expected an undeclared ${name} ${oldVersion} to fail doctor with ${id} and name the update`, old);
    }
  }
  for (const [installed, label] of [
    ['2.0.0', 'at the baseline (the stable)'],
    ['1.9.0', 'on another major'],
  ]) {
    const result = transitiveRun(name, installed);
    if (result.status !== 0) fail(`expected an undeclared ${name} ${installed} (${label}) to pass doctor`, result);
  }
}

// Bare-major ranges ("^1", "~0") name the 1.x line without a minor.
const bareMajor = mkdtempSync(join(tmpdir(), 'solid2-kit-doctor-major-'));
process.on('exit', () => rmSync(bareMajor, { recursive: true, force: true }));
writeFileSync(
  join(bareMajor, 'package.json'),
  JSON.stringify({ name: 'consumer', dependencies: { 'solid-js': '^1', '@solidjs/router': '1', '@solidjs/meta': '~0' } }, null, 2),
);
const bareMajorRun = runDoctor(bareMajor);
for (const id of ['solid-js-version', 'router-version', 'meta-version']) {
  if (!bareMajorRun.stderr.includes(`[${id}]`)) fail(`expected a bare-major range to be reported as ${id}`, bareMajorRun);
}

console.log(`doctor fixtures — OK (clean passed; bad reported ${expected.join(', ')}; freshly synced guidance not flagged stale; stale version still caught; router 1.0.0 install and last prerelease caught, the stable passed; TanStack Router 1.x / TanStack Query 5.x / Testing Library 0.x declared or installed caught, rc/next lines passed; Solid 2 prereleases older than the baseline (web/signals/diagnostics, vite-plugin) caught, the stable passed; undeclared JSX compilers below the baseline caught, at/above it or on another major passed; bare-major 1.x ranges caught)`);
