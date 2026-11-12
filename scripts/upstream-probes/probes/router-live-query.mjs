export const claim =
  '`liveQuery(fn, name)` from @solidjs/router is the live layer in one declaration: it stamps the server function `live()` itself (an explicit `live()` passes through), keeps one connection per (name + args) key shared by every consumer, and the returned function carries `.key`, `.keyFor` and a reactive `.status` — no separate `live()` declaration or hoisted sharing code is needed. (File-tier probe: importing the router package in plain Node hangs, so the claim is verified against the shipped types doc and implementation.)';
export const packages = ['@solidjs/router', '@solidjs/web'];

export async function probe(h) {
  const types = h.read('@solidjs/router', 'dist/data/liveQuery.d.ts');
  const impl = h.read('@solidjs/router', 'dist/data/liveQuery.js');
  const checks = {
    declared: /export declare function liveQuery/.test(types),
    oneConnectionPerKey: types.includes('One connection per (name + args) key, shared by every consumer'),
    liveImpliedInTypes: types.includes('Server functions are declared `live()` (which implies GET) at creation'),
    shape: /keyFor:/.test(types) && /key: string/.test(types) && /status:/.test(types),
    implWrapsLive: impl.includes('fn = live(fn)'),
    implKeysByNameAndArgs: impl.includes('name + hashKey(args)'),
  };
  return {
    reproduces: Object.values(checks).every(Boolean),
    observed: JSON.stringify(checks),
  };
}
