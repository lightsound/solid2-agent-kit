// Upstream-claim registry: the kit content (files/) states some Solid 2 behavior
// that holds only for the versions it was verified against — rc.9 deprecations,
// dev-only throws, upstream bugs, docs-vs-implementation mismatches. Each such
// claim carries an inline marker next to it:
//
//   <!-- upstream:<id> -->            or   <!-- upstream:<id> <issue-url> -->
//
// and every <id> has exactly one probe, probes/<id>.mjs, that reproduces the
// claim against installed packages. scripts/check-upstream.mjs runs the probes
// against the newest prereleases; this module owns the marker <-> probe contract.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BASELINE as WATCHED } from '../../bin/baseline.mjs';

export const KIT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PROBES_DIR = fileURLToPath(new URL('./probes', import.meta.url));

// Packages whose releases can make a marked claim stale, with the baseline
// versions the probes were verified against. The table ships with the CLI
// (bin/baseline.mjs) so `doctor` flags projects older than the same baseline.
export { WATCHED };

// Tools the probes drive, not packages under watch. TypeScript stays on 6.x:
// 7.x ships the native compiler without the JS API the type probes use.
export const TOOLING = {
  vite: '^8.0.0',
  typescript: '6.0.3',
};

const MARKER = /<!--\s*upstream:([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+(https:\/\/\S+))?\s*-->/g;
const MARKER_LIKE = /<!--\s*upstream\b[^>]*-->/g;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

export function scanMarkers() {
  const markers = [];
  const malformed = [];
  for (const file of walk(join(KIT_ROOT, 'files'))) {
    const rel = relative(KIT_ROOT, file);
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, index) => {
        const line = index + 1;
        const strict = [...text.matchAll(MARKER)];
        for (const match of strict) markers.push({ id: match[1], issue: match[2] ?? null, file: rel, line });
        const loose = [...text.matchAll(MARKER_LIKE)].length;
        if (loose > strict.length) malformed.push({ file: rel, line, text: text.trim() });
      });
  }
  return { markers, malformed };
}

export async function loadProbes() {
  const probes = [];
  for (const name of readdirSync(PROBES_DIR).filter((f) => f.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(join(PROBES_DIR, name)).href);
    probes.push({ id: name.slice(0, -'.mjs'.length), ...mod });
  }
  return probes;
}

// Every marker has a probe, every probe has a marker, probe metadata is complete,
// and a probe's upstream issue (if any) is quoted by every one of its markers.
export async function verifyMarkers() {
  const { markers, malformed } = scanMarkers();
  const probes = await loadProbes();
  const byId = new Map(probes.map((probe) => [probe.id, probe]));
  const problems = [];

  for (const m of malformed) problems.push(`${m.file}:${m.line}: malformed upstream marker: ${m.text}`);
  for (const m of markers) {
    const probe = byId.get(m.id);
    if (!probe) {
      problems.push(`${m.file}:${m.line}: marker "${m.id}" has no probe (scripts/upstream-probes/probes/${m.id}.mjs)`);
    } else if ((probe.issue ?? null) !== m.issue) {
      problems.push(
        `${m.file}:${m.line}: marker "${m.id}" must read <!-- upstream:${m.id}${probe.issue ? ` ${probe.issue}` : ''} -->`,
      );
    }
  }
  for (const probe of probes) {
    if (!markers.some((m) => m.id === probe.id)) problems.push(`probe "${probe.id}" has no marker in files/`);
    if (typeof probe.claim !== 'string' || !probe.claim) problems.push(`probe "${probe.id}": missing \`claim\``);
    if (typeof probe.probe !== 'function') problems.push(`probe "${probe.id}": missing \`probe()\``);
    if (!Array.isArray(probe.packages) || probe.packages.length === 0) {
      problems.push(`probe "${probe.id}": missing \`packages\``);
    } else {
      for (const name of probe.packages) {
        if (!WATCHED[name]) problems.push(`probe "${probe.id}": package "${name}" is not in WATCHED`);
      }
    }
  }
  return { markers, probes, problems };
}
