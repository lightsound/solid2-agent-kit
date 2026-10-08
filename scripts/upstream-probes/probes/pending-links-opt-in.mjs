export const claim =
  '`data-pending` on plain anchors is opt-in: `createRouter({ links: pendingLinks })` marks links covering the in-flight navigation target; without the plugin the claims sweep never reads pending state and writes no attribute. `aria-current` (same path and same query, hash and parameter order aside) and `data-active` (path prefix, root/base exact-only) need no plugin, and `useLinkState().pending` works either way.';
export const packages = ['@solidjs/router'];

export async function probe(h) {
  const index = h.read('@solidjs/router', 'dist/index.d.ts');
  const pending = h.read('@solidjs/router', 'dist/pending.d.ts');
  const factory = h.read('@solidjs/router', 'dist/routers/factory.d.ts');
  const claims = h.read('@solidjs/router', 'dist/claims.js');
  const exported = /\bpendingLinks\b/.test(index) && /export declare const pendingLinks: LinksPlugin/.test(pending);
  const option = /\blinks\?: LinksPlugin/.test(factory);
  const gated =
    /const plugin = links && links\(router, basePath\)/.test(claims) &&
    /plugin\.pending\(target\)/.test(claims);
  const optInWording = /data-pending` — the link is the target of an in-flight navigation;\s*\*\s*opt-in through `createRouter\(\{ links: pendingLinks \}\)`/.test(claims);
  return {
    reproduces: exported && option && gated && optInWording,
    observed: `pendingLinks export ${exported ? 'present' : 'absent'}; createRouter links option ${option ? 'typed' : 'absent'}; data-pending ${gated ? 'written only through the plugin' : 'NOT plugin-gated'}; opt-in documented in claims.js ${optInWording ? 'yes' : 'no'}`,
  };
}
