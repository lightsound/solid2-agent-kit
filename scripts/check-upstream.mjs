#!/usr/bin/env node
// Upstream-claim check: installs the newest dist-tagged Solid 2 prereleases
// into a temp directory, runs every probe in scripts/upstream-probes/probes/
// against them, and reports which marked claims in files/ no longer reproduce
// and which watched packages moved past the baseline the kit was verified on.
//
// Run: npm run check:upstream [-- options] (also run weekly by CI)
//   --versions latest|baseline   what to install (default: latest)
//   --dir <path>                 probe an existing install instead of installing
//   --only <id,id>               run only these probes
//   --json <file>, --markdown <file>   write the report (the workflow's issue body)
//   --keep                       keep the temp install and print its path
// Exit: 0 = every claim reproduces on the baseline versions, 1 = a claim changed,
// a probe failed, or a newer version was tested; 2 = setup failure.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createHarness } from './upstream-probes/harness.mjs';
import { TOOLING, WATCHED, verifyMarkers } from './upstream-probes/registry.mjs';
import { compareVersions, newestOnLine } from './upstream-probes/versions.mjs';

const REPO_BLOB = 'https://github.com/lightsound/solid2-agent-kit/blob/main';
const REGISTRY = (process.env.npm_config_registry || 'https://registry.npmjs.org').replace(/\/$/, '');

const { values: args } = parseArgs({
  options: {
    versions: { type: 'string', default: 'latest' },
    dir: { type: 'string' },
    only: { type: 'string' },
    json: { type: 'string' },
    markdown: { type: 'string' },
    keep: { type: 'boolean', default: false },
  },
});

function fail(message) {
  console.error(`check-upstream — ${message}`);
  process.exit(2);
}

// Exit 1 means findings; a crash (a registry or network error included) must not read as one.
process.on('uncaughtException', (error) => fail(`unexpected error: ${error?.stack ?? error}`));

if (!['latest', 'baseline'].includes(args.versions)) fail(`--versions must be "latest" or "baseline", got "${args.versions}"`);

const { markers, probes: allProbes, problems } = await verifyMarkers();
if (problems.length > 0) fail(`upstream markers and probes are out of sync:\n  - ${problems.join('\n  - ')}`);
const only = args.only ? new Set(args.only.split(',')) : null;
const probes = only ? allProbes.filter((p) => only.has(p.id)) : allProbes;
if (only && probes.length !== only.size) fail(`unknown probe id in --only ${args.only}`);

async function newestTagged(name, line) {
  const response = await fetch(`${REGISTRY}/-/package/${name.replace('/', '%2f')}/dist-tags`);
  if (!response.ok) fail(`failed to read dist-tags of ${name}: ${response.status}`);
  const tags = await response.json();
  const newest = newestOnLine(tags, line);
  if (!newest) fail(`no dist-tag of ${name} points at a ${line}.x version: ${JSON.stringify(tags)}`);
  return newest;
}

function install(versions) {
  const dir = mkdtempSync(join(tmpdir(), 'solid2-upstream-'));
  const dependencies = { ...versions, ...TOOLING };
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'upstream-probes', private: true, type: 'module', dependencies }, null, 2));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    npm,
    ['install', '--no-audit', '--no-fund', '--no-package-lock', '--ignore-scripts', '--loglevel=error'],
    { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (result.status !== 0) fail(`npm install failed in ${dir}:\n${result.stderr || result.stdout}`);
  return dir;
}

function installedVersion(dir, name) {
  try {
    return JSON.parse(readFileSync(join(dir, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

let dir;
if (args.dir) {
  dir = resolve(args.dir);
} else {
  const versions = {};
  for (const [name, { line, baseline }] of Object.entries(WATCHED)) {
    versions[name] = args.versions === 'baseline' ? baseline : await newestTagged(name, line);
  }
  console.log(`check-upstream — installing ${Object.entries(versions).map(([n, v]) => `${n}@${v}`).join(' ')}`);
  dir = install(versions);
}

const packages = Object.entries(WATCHED).map(([name, { baseline }]) => {
  const tested = installedVersion(dir, name);
  return { name, baseline, tested, newer: tested !== null && compareVersions(tested, baseline) > 0 };
});
if (packages.some((p) => p.tested === null)) {
  fail(`not installed in ${dir}: ${packages.filter((p) => p.tested === null).map((p) => p.name).join(', ')}`);
}

const harness = createHarness(dir);
const results = [];
for (const probe of probes) {
  const started = Date.now();
  let result;
  try {
    const { reproduces, observed } = await probe.probe(harness);
    result = { status: reproduces ? 'reproduces' : 'changed', observed };
  } catch (error) {
    result = { status: 'error', observed: String(error?.stack ?? error).slice(0, 1500) };
  }
  results.push({
    id: probe.id,
    claim: probe.claim,
    issue: probe.issue ?? null,
    packages: probe.packages,
    locations: markers.filter((m) => m.id === probe.id).map((m) => `${m.file}:${m.line}`),
    ms: Date.now() - started,
    ...result,
  });
  const icon = { reproduces: 'ok     ', changed: 'CHANGED', error: 'ERROR  ' }[result.status];
  console.log(`  ${icon} ${probe.id} (${Date.now() - started} ms) — ${result.status === 'error' ? result.observed : result.observed.split('\n')[0]}`);
}

if (!args.dir && !args.keep) rmSync(dir, { recursive: true, force: true });
else console.log(`check-upstream — install kept at ${dir}`);

const flagged = results.filter((r) => r.status !== 'reproduces');
const newer = packages.filter((p) => p.newer);
const status = flagged.length === 0 && newer.length === 0 ? 'clean' : 'attention';
const fingerprint = createHash('sha256')
  .update(JSON.stringify([packages.map((p) => [p.name, p.tested]), flagged.map((r) => [r.id, r.status])]))
  .digest('hex')
  .slice(0, 16);

function markdown() {
  const lines = [
    `<!-- upstream-watch fingerprint=${fingerprint} -->`,
    'Automated report from `npm run check:upstream` (`.github/workflows/upstream-watch.yml`).',
    '',
    '| Package | Baseline | Tested | |',
    '|---|---|---|---|',
    ...packages.map((p) => `| \`${p.name}\` | ${p.baseline} | ${p.tested} | ${p.newer ? '**new version**' : ''} |`),
    '',
  ];
  if (flagged.length === 0) {
    lines.push(`All ${results.length} marked claims still reproduce.`);
  } else {
    lines.push(`### Claims that no longer reproduce (${flagged.length} of ${results.length})`, '');
    for (const r of flagged) {
      lines.push(
        `- **\`${r.id}\`** — ${r.status === 'error' ? 'probe failed' : 'changed'}${r.issue ? ` (upstream: ${r.issue})` : ''}`,
        `  - Claim: ${r.claim}`,
        `  - Observed: ${r.status === 'error' ? `\`${r.observed.split('\n')[0]}\` (full stack in the workflow log)` : r.observed}`,
        `  - Marked at: ${r.locations.map((loc) => `[${loc}](${REPO_BLOB}/${loc.replace(/:(\d+)$/, '#L$1')})`).join(', ')}`,
      );
    }
  }
  lines.push(
    '',
    'To resolve: update or remove the marked text (and its probe) for each changed claim, re-verify with',
    '`npm run check:upstream`, then move `baseline` in `scripts/upstream-probes/registry.mjs` to the tested versions.',
    'This issue closes itself on the first clean run.',
  );
  return lines.join('\n');
}

const report = { status, fingerprint, packages, results };
if (args.json) writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
if (args.markdown) writeFileSync(args.markdown, `${markdown()}\n`);

for (const p of newer) console.log(`check-upstream — new version: ${p.name} ${p.baseline} → ${p.tested}`);
console.log(
  `check-upstream — ${results.length - flagged.length}/${results.length} claims reproduce` +
    (flagged.length ? `; ${flagged.map((r) => `${r.id} ${r.status}`).join(', ')}` : '') +
    (newer.length ? `; ${newer.length} package(s) newer than baseline` : '; all packages at baseline'),
);
process.exit(status === 'clean' ? 0 : 1);
