// Version selection for check:upstream, kept free of I/O so tests can pin it.

import { compareVersions, parseVersion } from '../../bin/baseline.mjs';

export { compareVersions, parseVersion };

// The newest version any dist-tag points at on the given major, or null.
// Dist-tags, not the full version list: they are the publisher's intent
// (`next` / `rc`), and they lag each other (@solidjs/vite-plugin's `latest` is
// ahead of `next`).
export function newestOnLine(distTags, line) {
  const candidates = Object.values(distTags).filter((v) => parseVersion(v).core[0] === line);
  return candidates.length === 0 ? null : candidates.sort(compareVersions).at(-1);
}
