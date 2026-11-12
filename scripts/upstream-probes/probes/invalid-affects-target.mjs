export const claim =
  'In the dev build, `affects()` given a key for something that is not a store — a signal accessor with a key — throws `[INVALID_AFFECTS_TARGET]`: keys address store leaves only, so `affects(item, "quantity")` needs `item` to be a store (or store row); a bare accessor takes no key, and a key path on a store (`affects(store, "a.b")`) is accepted. The prod build does not check.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { affects, createRoot, createSignal, createStore, flush } from "solid-js";
const attempt = (fn) => { try { fn(); return "ok"; } catch (e) { return String(e?.message ?? e).match(/^\\[([A-Z_]+)\\]/)?.[1] ?? "threw"; } };
let out;
createRoot(() => {
  const [s] = createSignal(1);
  const [store] = createStore({ quantity: 1 });
  out = {
    accessorWithKey: attempt(() => affects(s, "quantity")),
    storeKeyPath: attempt(() => affects(store, "a.b")),
    storeLeaf: attempt(() => affects(store, "quantity")),
    bareAccessor: attempt(() => affects(s)),
  };
});
flush();
console.log(JSON.stringify(out));`;

export async function probe(h) {
  const dev = h.nodeJson(script, { conditions: ['browser', 'development'] });
  const prod = h.nodeJson(script, { conditions: ['browser'] });
  return {
    reproduces:
      dev.accessorWithKey === 'INVALID_AFFECTS_TARGET' && dev.storeKeyPath === 'ok' && dev.storeLeaf === 'ok' && dev.bareAccessor === 'ok' && prod.accessorWithKey === 'ok',
    observed: `dev: accessor+key ${dev.accessorWithKey}, store key path ${dev.storeKeyPath}, store leaf ${dev.storeLeaf}, bare accessor ${dev.bareAccessor}; prod: accessor+key ${prod.accessorWithKey}`,
  };
}
