export const claim =
  '`data-pending` on plain anchors is opt-in: `createRouter({ links: pendingLinks })` marks links covering the in-flight navigation target; without the plugin the claims sweep never reads pending state and writes no attribute. `aria-current` (same path and same query, hash and parameter order aside) and `data-active` (path prefix, root/base exact-only) need no plugin, and `useLinkState().pending` works either way.';
export const packages = ['@solidjs/router'];

export async function probe(h) {
  const index = h.read('@solidjs/router', 'dist/index.d.ts');
  const pending = h.read('@solidjs/router', 'dist/pending.d.ts');
  const factory = h.read('@solidjs/router', 'dist/routers/factory.d.ts');
  const claims = h.read('@solidjs/router', 'dist/claims.js');
  const routing = h.read('@solidjs/router', 'dist/routing.js');
  const exported = /\bpendingLinks\b/.test(index) && /export declare const pendingLinks: LinksPlugin/.test(pending);
  const option = /\blinks\?: LinksPlugin/.test(factory);
  const gated =
    /const plugin = links && links\(router, basePath\)/.test(claims) &&
    /plugin\.pending\(target\)/.test(claims);
  const optInWording = /data-pending` — the link is the target of an in-flight navigation;\s*\*\s*opt-in through `createRouter\(\{ links: pendingLinks \}\)`/.test(claims);
  // useLinkState's pending asks the router directly, never the claims plugin.
  const hookPending = /pending: createMemo\(\(\) => \{[^}]*linkPending\(router, to\(\), base, options\.end\)/.test(routing);
  // The matching rule claimed anchors and useLinkState share.
  const m = h.nodeJson(
    `import { matchLink } from ${JSON.stringify(`${h.dir}/node_modules/@solidjs/router/dist/utils.js`)};
     const at = (pathname, search = "") => ({ pathname, search });
     console.log(JSON.stringify({
       reordered: matchLink(at("/a", "?x=1&y=2"), "/a?y=2&x=1", ""),
       queryMissing: matchLink(at("/a", "?page=2"), "/a", ""),
       hashIgnored: matchLink(at("/a", "?x=1"), "/a?x=1#h", ""),
       descendant: matchLink(at("/a/b"), "/a", ""),
       root: matchLink(at("/a"), "/", ""),
       base: matchLink(at("/app/x"), "/app", "/app"),
     }));
     process.exit(0);`,
  );
  const matching =
    m.reordered.current && m.hashIgnored.current &&
    !m.queryMissing.current && m.queryMissing.active &&
    m.descendant.active && !m.descendant.current &&
    !m.root.active && !m.base.active;
  return {
    reproduces: exported && option && gated && optInWording && hookPending && matching,
    observed: `pendingLinks export ${exported ? 'present' : 'absent'}; createRouter links option ${option ? 'typed' : 'absent'}; data-pending ${gated ? 'written only through the plugin' : 'NOT plugin-gated'}; opt-in documented in claims.js ${optInWording ? 'yes' : 'no'}; useLinkState().pending without the plugin: ${hookPending}; aria-current needs the same query (order/hash aside), data-active is a path prefix with root/base exact-only: ${matching}${matching ? '' : ` (${JSON.stringify(m)})`}`,
  };
}
