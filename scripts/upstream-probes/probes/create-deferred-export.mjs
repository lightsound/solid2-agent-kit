export const claim =
  '`createDeferred(fn)` is a Solid 2.0 primitive exported from `solid-js` — an async memo that may lag its inputs but never leads them, with `isPending` reporting the catch-up — not the removed 1.x `createDeferred(source, { timeoutMs })`.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const types = h.read('@solidjs/signals', 'dist/types/deferred.d.ts');
  const typed = /export declare function createDeferred<T>\(fn: \(prev\?: T\) => T \| PromiseLike<T> \| AsyncIterable<T>, options\?: MemoOptions<T>\): SourceAccessor<T>;/.test(types);
  const documented = /may lag, but never leads/.test(types) && /`isPending` reports the refetch/.test(types);
  const r = h.nodeJson(
    `import { createRoot, createSignal, createDeferred, createMemo, isPending, flush, resolve } from "solid-js";
     const [n, setN] = createSignal(1);
     let d, pendingDuringRefetch = null, settled;
     createRoot(() => {
       d = createDeferred(async () => { const v = n(); await new Promise((r) => setTimeout(r, 5)); return v * 10; });
       createMemo(() => { try { return d(); } catch { return undefined; } });
     });
     const first = await resolve(() => d());
     setN(2);
     flush();
     // The refetch holds nothing: the stale value stays readable (resolve() returns at once) while isPending reports it.
     const stale = await resolve(() => d());
     createRoot(() => { pendingDuringRefetch = isPending(() => d()); });
     for (let i = 0; i < 100 && settled !== 20; i++) { await new Promise((r) => setTimeout(r, 5)); flush(); createRoot(() => { settled = d(); }); }
     console.log(JSON.stringify({ type: typeof createDeferred, first, stale, pendingDuringRefetch, settled }));
     process.exit(0);`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces: typed && documented && r.type === 'function' && r.first === 10 && r.stale === 10 && r.pendingDuringRefetch === true && r.settled === 20,
    observed: `signature typed: ${typed}; documented as lag-never-lead with isPending: ${documented}; runtime export ${r.type}, first value ${r.first}, read during refetch ${r.stale} (lags) with isPending ${r.pendingDuringRefetch}, settled ${r.settled}`,
  };
}
