export const claim =
  'Since 2.0.0-rc.18, `from(source)` from `solid-js` adapts a callback subscription (`(next, error, complete) => unsubscribe`), an Observable (`subscribe(observer)`, `Symbol.observable` interop), or an AsyncIterable into an AsyncIterable a computation returns — `createMemo(() => from(source))`. A subscription keeps only the latest value, a value pushed during `subscribe` lands with no loading frame, and the source closes when the computation re-runs or its owner is disposed.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const types = h.read('@solidjs/signals', 'dist/types/index.d.ts');
  const typed = /export \{[^}]*\bfrom\b/.test(types) || /declare function from</.test(types);
  const r = h.nodeJson(
    `import { createRoot, createSignal, createMemo, from, resolve, isPending, flush } from "solid-js";
     const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
     const settle = async (read, want) => {
       let v;
       for (let i = 0; i < 100; i++) { await sleep(5); flush(); v = await resolve(read); if (v === want) break; }
       return v;
     };
     // Callback subscription: sync push, conflation, disposal.
     let push = () => {}, subs = 0, unsubs = 0;
     const source = (next, error, complete) => { subs += 1; push = next; next(1); return () => { unsubs += 1; }; };
     let memo;
     const dispose = createRoot((d) => { memo = createMemo(() => from(source)); return d; });
     flush();
     let snap;
     createRoot(() => { snap = { pending: isPending(() => memo()), value: memo() }; });
     push(2); push(3);
     const conflated = await settle(() => memo(), 3);
     dispose();
     const cb = { first: snap.value, firstPending: snap.pending, conflated, subs, unsubs };
     // Re-run: a signal-chosen source closes the old one and opens the new one.
     let subsA = 0, unsubsA = 0, subsB = 0, unsubsB = 0;
     const srcA = (next) => { subsA += 1; next("a1"); return () => { unsubsA += 1; }; };
     const srcB = (next) => { subsB += 1; next("b1"); return () => { unsubsB += 1; }; };
     let setWhich, memoR;
     const disposeR = createRoot((d) => {
       const [which, sw] = createSignal("a"); setWhich = sw;
       memoR = createMemo(() => from(which() === "a" ? srcA : srcB));
       return d;
     });
     const rerunFirst = await settle(() => memoR(), "a1");
     setWhich("b"); flush();
     const rerunSecond = await settle(() => memoR(), "b1");
     disposeR();
     const rerun = { first: rerunFirst, second: rerunSecond, subsA, unsubsA, subsB, unsubsB };
     // Observable form.
     let obsPush = () => {}, obsUnsubs = 0;
     const observable = { subscribe(observer) { obsPush = (v) => observer.next(v); observer.next(10); return () => { obsUnsubs += 1; }; } };
     let memo2;
     const dispose2 = createRoot((d) => { memo2 = createMemo(() => from(observable)); return d; });
     const obsFirst = await settle(() => memo2(), 10);
     obsPush(20);
     const obsSecond = await settle(() => memo2(), 20);
     dispose2();
     // AsyncIterable form.
     let wake = () => {}; const queue = [7];
     const iterable = { [Symbol.asyncIterator]: async function* () { let seen = 0; while (true) { if (queue.length > seen) { yield queue[seen++]; continue; } await new Promise((res) => { wake = res; }); } } };
     let memo3;
     createRoot(() => { memo3 = createMemo(() => from(iterable)); });
     const iterFirst = await settle(() => memo3(), 7);
     queue.push(8); wake();
     const iterSecond = await settle(() => memo3(), 8);
     console.log(JSON.stringify({ exported: typeof from, cb, rerun, obsFirst, obsSecond, obsUnsubs, iterFirst, iterSecond }));
     process.exit(0);`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces:
      typed &&
      r.exported === 'function' &&
      r.cb.first === 1 &&
      r.cb.firstPending === false &&
      r.cb.conflated === 3 &&
      r.cb.subs === 1 &&
      r.cb.unsubs === 1 &&
      r.rerun.first === 'a1' &&
      r.rerun.second === 'b1' &&
      r.rerun.subsA === 1 &&
      r.rerun.unsubsA === 1 &&
      r.rerun.subsB === 1 &&
      r.rerun.unsubsB === 1 &&
      r.obsFirst === 10 &&
      r.obsSecond === 20 &&
      r.obsUnsubs === 1 &&
      r.iterFirst === 7 &&
      r.iterSecond === 8,
    observed: `typed export in @solidjs/signals types: ${typed}; runtime export ${r.exported}; callback source: value pushed during subscribe read as ${r.cb.first} with isPending ${r.cb.firstPending} (no loading frame), pushes 2 then 3 conflated to ${r.cb.conflated}, subscriptions ${r.cb.subs}, unsubscribes after dispose ${r.cb.unsubs}; re-run: ${r.rerun.first} then ${r.rerun.second}, old source unsubscribed ${r.rerun.unsubsA}, new source subscribed ${r.rerun.subsB} and unsubscribed on dispose ${r.rerun.unsubsB}; observable: first ${r.obsFirst}, after push ${r.obsSecond}, unsubscribes after dispose ${r.obsUnsubs}; async iterable: ${r.iterFirst} then ${r.iterSecond}`,
  };
}
