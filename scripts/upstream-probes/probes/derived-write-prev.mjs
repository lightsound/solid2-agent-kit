export const claim =
  'A manual write to a `createSignal(fn)` / `createStore(fn)` derivation lands at once; on a source change the function re-runs receiving the write as `prev` (the store passes it as the draft), so a function that ignores `prev` discards a write made in the same update as a source change — the beta.11 same-tick write precedence no longer holds.';
export const packages = ['solid-js'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { createSignal, flush } from "solid-js";
     const [src, setSrc] = createSignal(1);
     const seen = [];
     const [v, setV] = createSignal((prev) => { seen.push(prev); return src() * 10; });
     flush();
     const initial = v();
     setV(5); flush();
     const afterWrite = v();
     const runsAfterWrite = seen.length;
     setSrc(2); flush();
     const afterSource = v();
     const prevOnRerun = seen.at(-1);
     setSrc(3); setV(9); flush();
     const sameUpdate = v();
     const prevSameUpdate = seen.at(-1);
     console.log(JSON.stringify({ initial, afterWrite, runsAfterWrite, afterSource, prevOnRerun, sameUpdate, prevSameUpdate, runs: seen.length }));
     process.exit(0);`,
    { conditions: ['browser'] },
  );
  const reproduces =
    r.initial === 10 &&
    r.afterWrite === 5 &&
    r.runsAfterWrite === 1 &&
    r.afterSource === 20 &&
    r.prevOnRerun === 5 &&
    r.sameUpdate === 30 &&
    r.prevSameUpdate === 9 &&
    r.runs === 3;
  return {
    reproduces,
    observed: `initial: ${r.initial}; after write: ${r.afterWrite} (fn runs: ${r.runsAfterWrite}); after source change: ${r.afterSource} with prev ${r.prevOnRerun}; write + source change in one update: ${r.sameUpdate} with prev ${r.prevSameUpdate}; total fn runs: ${r.runs}`,
  };
}
