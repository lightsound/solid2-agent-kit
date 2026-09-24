// Version selection for check:upstream, kept free of I/O so tests can pin it.

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

// The newest version any dist-tag points at on the given major, or null.
// Dist-tags, not the full version list: they are the publisher's intent
// (`next` / `rc`), and they lag each other (@solidjs/vite-plugin's `latest` is
// ahead of `next`).
export function newestOnLine(distTags, line) {
  const candidates = Object.values(distTags).filter((v) => parseVersion(v).core[0] === line);
  return candidates.length === 0 ? null : candidates.sort(compareVersions).at(-1);
}
