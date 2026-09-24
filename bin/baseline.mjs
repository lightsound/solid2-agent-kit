// The Solid 2 releases the kit's guidance is verified against, shared by
// `solid2-kit doctor` (a project on an older release is flagged) and
// check:upstream (scripts/upstream-probes/registry.mjs: a newer release is
// flagged). `line` is the major the kit targets: check:upstream installs the
// newest dist-tagged version on it. `baseline` is the version every upstream
// probe was verified against — bump it (and fix any marked claim that changed)
// after re-verifying.
//
// npm dist-tags lag each other on these prereleases (@solidjs/web, @solidjs/signals
// and @solidjs/diagnostics `latest` is an older 2.0 rc than `next`;
// @solidjs/vite-plugin's `next` is behind `latest`), so a bare install can
// resolve a release older than the baseline.
export const BASELINE = {
  'solid-js': { line: 2, baseline: '2.0.0-rc.9' },
  '@solidjs/web': { line: 2, baseline: '2.0.0-rc.9' },
  '@solidjs/signals': { line: 2, baseline: '2.0.0-rc.9' },
  '@solidjs/diagnostics': { line: 2, baseline: '2.0.0-rc.9' },
  '@solidjs/router': { line: 2, baseline: '2.0.0-next.27' },
  '@solidjs/vite-plugin': { line: 3, baseline: '3.0.0-next.44' },
  '@solidjs/testing-library': { line: 1, baseline: '1.0.0-beta.3' },
};

export function parseVersion(version) {
  const [core, pre] = version.split('+')[0].split(/-(.*)/s);
  return { core: core.split('.').map(Number), pre: pre ? pre.split('.') : [] };
}

// Semver precedence, prerelease-aware (2.0.0-rc.10 > 2.0.0-rc.9 < 2.0.0).
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const [p, q] = [x.pre[i], y.pre[i]];
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
    const numeric = /^\d+$/.test(p) && /^\d+$/.test(q);
    if (p !== q) return numeric ? Number(p) - Number(q) : /^\d+$/.test(p) ? -1 : /^\d+$/.test(q) ? 1 : p < q ? -1 : 1;
  }
  return 0;
}
