// `doctor`: the project-wiring gate — dependencies, tsconfig and root
// configs, checked against the kit's baseline.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BASELINE, compareVersions } from './baseline.mjs';
import { VERSION, flagValue } from './context.mjs';

// Project-config gate: `check` covers TSX sources, `doctor` covers the wiring
// around them — dependencies, tsconfig, and root config files — where agents
// also reach for React / Solid 1.x tooling (vite-plugin-solid,
// eslint-plugin-solid, jsxImportSource: "solid-js", ...).

export const BANNED_DEPS = {
  react: 'React does not belong in a Solid 2.0 project.',
  'react-dom': 'React does not belong in a Solid 2.0 project.',
  next: 'Next.js does not belong in a Solid 2.0 project.',
  'vite-plugin-solid': 'Solid 1.x Vite plugin. Use @solidjs/vite-plugin.',
  'eslint-plugin-solid':
    'Built for Solid 1.x; its analyzer misreads Solid 2 idioms (two-phase createEffect, writable derivations, draft setters). Remove it — solid2-kit check carries the still-valid intents.',
  '@solidjs/start': 'SolidStart 1.x. Solid 2 start mode lives in @solidjs/vite-plugin (start: true).',
  'solid-start': 'SolidStart 0.x. Solid 2 start mode lives in @solidjs/vite-plugin (start: true).',
  'solid-app-router': 'Pre-1.0 router. Use @solidjs/router 2 (createRouter({ routes })).',
  vinxi: 'SolidStart 1.x toolchain. Solid 2 uses @solidjs/vite-plugin directly.',
};

// Packages whose Solid 1.x line a project can still be holding: for
// @solidjs/meta (0.29) and @solidjs/testing-library (0.8) npm `latest` is
// still that line, and the TanStack packages (@tanstack/solid-router 1.x,
// @tanstack/solid-query 5.x) publish their Solid 2 lines only on `rc`.
// solid-js and @solidjs/router are here for the opposite reason: since the
// 2.0.0 release their `latest` is the 2.x line itself, so a 1.x declaration
// (1.9 / 1.0) is a pre-2.0 project that never moved — flag it and name the
// plain install, not a dist-tag (`next` still points at a 2.0.0 prerelease).
const SOLID2_LINE_PACKAGES = [
  { name: 'solid-js', id: 'solid-js-version', solid1: /^[\s^~=v]*[01](?:\.|$)/, fix: 'Install solid-js@^2.' },
  {
    name: '@solidjs/router',
    id: 'router-version',
    solid1: /^[\s^~=v]*[01](?:\.|$)/,
    fix: 'Router 1.x is JSX <Route> with a solid-js ^1 peer; install @solidjs/router@^2 (createRouter({ routes })).',
  },
  {
    name: '@solidjs/meta',
    id: 'meta-version',
    solid1: /^[\s^~=v]*0(?:\.|$)/,
    fix: 'Meta 0.x is built for Solid 1 (<MetaProvider> required); install @solidjs/meta@next (1.x).',
  },
  {
    name: '@tanstack/solid-router',
    id: 'tanstack-router-version',
    solid1: /^[\s^~=v]*[01](?:\.|$)/,
    fix: 'TanStack Router 1.x has a solid-js ^1.9 peer; install @tanstack/solid-router@rc (2.x, solid-js 2 peer).',
  },
  {
    name: '@tanstack/solid-query',
    id: 'tanstack-query-version',
    solid1: /^[\s^~=v]*[0-5](?:\.|$)/,
    fix: 'TanStack Query 5.x has a solid-js ^1.6 peer; install @tanstack/solid-query@rc (6.x, solid-js 2 peer).',
  },
  {
    name: '@solidjs/testing-library',
    id: 'testing-library-version',
    solid1: /^[\s^~=v]*0(?:\.|$)/,
    fix: 'Testing Library 0.x renders through solid-js/web (Solid 1); install @solidjs/testing-library@next (1.x, solid-js 2 peer).',
  },
];

// Packages doctor checks the version of: the Solid 1.x lines above, then any
// release older than the kit's baseline (bin/baseline.mjs) — dist-tags still
// lag on parts of the line (@solidjs/vite-plugin's `next` trails its
// `latest`; @solidjs/testing-library's `latest` is the 0.x line), so a bare
// install can resolve a release older than the baseline.
const VERSION_CHECKED = [...new Set([...SOLID2_LINE_PACKAGES.map((p) => p.name), ...Object.keys(BASELINE)])];

// The lower bound of a single-comparator range ("^2.0.0-rc.0", "~2.0.0-rc.8",
// ">=2.0.0-rc.0", "2.0.0-rc.0") or an installed version. Dist-tags, "*",
// unions and protocol specs have no bound to read; their install is checked.
const LOWER_BOUND = /^\s*(?:[\^~]|>=|=)?\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\s*$/;

// `declared` ranges are judged by their floor: npm installs the `latest` tag
// whenever it satisfies the range, so "^2.0.0-rc.0" resolves to rc.0 today.
function versionProblem(name, version, declared) {
  const line = SOLID2_LINE_PACKAGES.find((p) => p.name === name);
  if (line?.solid1.test(version)) return `the Solid 1.x line; this kit teaches Solid 2.x. ${line.fix}`;
  const baseline = BASELINE[name]?.baseline;
  const lowest = version.match(LOWER_BOUND)?.[1];
  if (baseline && lowest && compareVersions(lowest, baseline) < 0) {
    const older = declared ? 'allows releases older than' : 'older than';
    return `${older} ${baseline}, the release this kit's guidance is verified against (npm dist-tags lag on parts of the Solid 2 line, so a bare install can resolve an older one). Install ${name}@^${baseline}.`;
  }
  return null;
}

// An undeclared package on the baseline's major that a dependency pulled in
// (the JSX compilers under @solidjs/vite-plugin): only the floor applies — a
// lockfile keeps the version it first resolved. Another major is someone
// else's copy, not the one the kit's guidance describes.
function transitiveProblem(name, installed) {
  const { line, baseline } = BASELINE[name];
  if (!LOWER_BOUND.test(installed) || compareVersions(installed, `${line}.0.0-0`) < 0 || compareVersions(installed, `${line + 1}.0.0-0`) >= 0) {
    return null;
  }
  if (compareVersions(installed, baseline) >= 0) return null;
  return `older than ${baseline}, the release this kit's guidance is verified against. It is not in package.json, so a dependency installed it and the lockfile holds the old version: update it (\`npm update ${name}\`, \`pnpm update ${name}\`, or reinstall without the lockfile entry).`;
}

function installedVersion(target, name) {
  try {
    return JSON.parse(readFileSync(join(target, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return undefined;
  }
}

const CONFIG_SOURCE = /\.(?:m|c)?[jt]s$/;

// Files installed by this kit that carry a version marker. When the kit
// dependency is updated but `sync` is not re-run, the installed guidance
// keeps teaching agents the older content — silent drift doctor can catch.
const GUIDANCE_FILES = ['.cursor/rules/solid-2.mdc', 'CLAUDE.md', 'AGENTS.md'];

export function doctorFindings(target) {
  const findings = [];
  const report = (id, message) => findings.push({ id, message });

  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, message] of Object.entries(BANNED_DEPS)) {
    if (name in deps) report(`dep-${name.replace(/[@/]/g, '')}`, `package.json depends on "${name}". ${message}`);
  }
  for (const name of VERSION_CHECKED) {
    const id = SOLID2_LINE_PACKAGES.find((p) => p.name === name)?.id ?? `${name.replace('@solidjs/', '')}-version`;
    const range = deps[name];
    if (typeof range !== 'string') {
      const installed = BASELINE[name] && installedVersion(target, name);
      const transitive = installed && transitiveProblem(name, installed);
      if (transitive) report(id, `node_modules has ${name} ${installed} (not in package.json) — ${transitive}`);
      continue;
    }
    const declared = versionProblem(name, range, true);
    if (declared) {
      report(id, `package.json pins ${name} "${range}" — ${declared}`);
      continue;
    }
    // A range such as "latest" or "*" only shows its version once resolved.
    const installed = installedVersion(target, name);
    const resolved = installed && versionProblem(name, installed, false);
    if (resolved) report(id, `node_modules has ${name} ${installed} (package.json: "${range}") — ${resolved}`);
  }

  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(target, entry.name);

    if (/^tsconfig.*\.json$/.test(entry.name)) {
      // tsconfig is JSONC; extract the two relevant keys with regexes.
      const content = readFileSync(path, 'utf8');
      const jsx = content.match(/"jsx"\s*:\s*"([^"]+)"/)?.[1];
      if (jsx && jsx !== 'preserve') {
        report('tsconfig-jsx', `${entry.name} sets "jsx": "${jsx}". Solid 2 compiles its own JSX: use "preserve".`);
      }
      const importSource = content.match(/"jsxImportSource"\s*:\s*"([^"]+)"/)?.[1];
      if (importSource && importSource !== '@solidjs/web') {
        report(
          'tsconfig-jsx-import-source',
          `${entry.name} sets "jsxImportSource": "${importSource}". Solid 2 JSX types live in "@solidjs/web".`,
        );
      }
      continue;
    }

    if (CONFIG_SOURCE.test(entry.name)) {
      const content = readFileSync(path, 'utf8');
      if (/['"]vite-plugin-solid['"]/.test(content)) {
        report('config-vite-plugin-solid', `${entry.name} references vite-plugin-solid (Solid 1.x). Import solid from "@solidjs/vite-plugin".`);
      }
      if (/jsxImportSource['"]?\s*[:=]\s*['"](?:solid-js|react)['"]/.test(content)) {
        report('config-jsx-import-source', `${entry.name} sets jsxImportSource to solid-js/react. Solid 2 uses "@solidjs/web".`);
      }
    }

    if (/^(?:\.eslintrc|eslint\.config\.)/.test(entry.name)) {
      const content = readFileSync(path, 'utf8');
      if (content.includes('eslint-plugin-solid')) {
        report('eslint-plugin-solid', `${entry.name} wires eslint-plugin-solid (Solid 1.x analyzer; false-positives on Solid 2 idioms). Remove it.`);
      }
    }
  }

  for (const guidance of GUIDANCE_FILES) {
    const path = join(target, guidance);
    if (!existsSync(path)) continue;
    // The version must end on a word character so the sentence punctuation
    // that follows the marker ("… v0.8.0. Do not edit …", "…v0.8.0**.") is
    // not captured — with `[\w.-]*` alone the trailing period made every
    // freshly synced file compare as "0.8.0." !== "0.8.0" (always stale).
    const installed = readFileSync(path, 'utf8').match(/solid2-agent-kit v(\d(?:[\w.-]*\w)?)/)?.[1];
    if (installed && installed !== VERSION) {
      report(
        'stale-guidance',
        `${guidance} was installed by solid2-agent-kit v${installed} but v${VERSION} is running — run \`solid2-kit sync\` so agents read current guidance.`,
      );
    }
  }

  return findings;
}

export function doctor() {
  const target = resolve(flagValue('--target', '.'));
  if (!existsSync(join(target, 'package.json'))) {
    console.error(`solid2-kit doctor — no package.json at ${target} (use --target)`);
    process.exit(2);
  }

  const findings = doctorFindings(target);
  for (const { id, message } of findings) console.error(`[${id}] ${message}`);

  if (findings.length > 0) {
    console.error(`\nsolid2-kit doctor — ${findings.length} finding(s). Fix the project wiring above.`);
    process.exit(1);
  }
  console.log('solid2-kit doctor — OK (dependencies, tsconfig, root configs, and installed guidance look like Solid 2).');
}
