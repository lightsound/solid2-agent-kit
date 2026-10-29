export const claim =
  'Since 2.0.0-rc.18, `from(source)` from `solid-js` adapts a callback subscription (`(next, error, complete) => unsubscribe`), an Observable (`subscribe(observer)`, `Symbol.observable` interop), or an AsyncIterable into an AsyncIterable a computation returns — `createMemo(() => from(source))`. A subscription keeps only the latest value, a value pushed during `subscribe` lands with no loading frame, and the source closes when the computation re-runs or its owner is disposed.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const types = h.read('@solidjs/signals', 'dist/types/index.d.ts');
  const typed = /export \{[^}]*\bfrom\b/.test(types) || /declare function from</.test(types);
  const r = h.nodeJson(
    `import { createRoot, createMemo, from, resolve, flush } from "solid-js";
     const settle = async (read, want) => {
       let v;
       for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 5)); flush(); v = await resolve(read); if (v === want) break; }
       return v;
     };
     let push = () => {}, subs = 0, unsubs = 0;
     const source = (next, error, complete) => { subs += 1; push = next; next(1); return () => { unsubs += 1; }; };
     let memo;
     const dispose = createRoot((d) => { memo = createMemo(() => from(source)); return d; });
     const first = await settle(() => memo(), 1);
     push(2);
     const second = await settle(() => memo(), 2);
     dispose();
     let obsPush = () => {}, obsUnsubs = 0;
     const observable = { subscribe(observer) { obsPush = (v) => observer.next(v); observer.next(10); return () => { obsUnsubs += 1; }; } };
     let memo2;
     const dispose2 = createRoot((d) => { memo2 = createMemo(() => from(observable)); return d; });
     const obsFirst = await settle(() => memo2(), 10);
     obsPush(20);
     const obsSecond = await settle(() => memo2(), 20);
     dispose2();
     console.log(JSON.stringify({ exported: typeof from, first, second, subs, unsubs, obsFirst, obsSecond, obsUnsubs }));
     process.exit(0);`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces:
      typed &&
      r.exported === 'function' &&
      r.first === 1 &&
      r.second === 2 &&
      r.subs === 1 &&
      r.unsubs === 1 &&
      r.obsFirst === 10 &&
      r.obsSecond === 20 &&
      r.obsUnsubs === 1,
    observed: `typed export in @solidjs/signals types: ${typed}; runtime export ${r.exported}; callback source: first value ${r.first} (pushed during subscribe), after push ${r.second}, subscriptions ${r.subs}, unsubscribes after dispose ${r.unsubs}; observable: first ${r.obsFirst}, after push ${r.obsSecond}, unsubscribes after dispose ${r.obsUnsubs}`,
  };
}
