export const claim =
  '`attribution.enable()` taken while the engine is already enabled opens a fresh window: `attribution.history(type)` (and the `costs()` / `feedback()` folds) read only from that moment on, so app code calling `enable()` during a test or a capture erases what the harness had recorded. Options combine across holds by the most demanding value per key, so a threshold one holder turns off stays armed while another holder\'s default hold stands.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const types = h.read('@solidjs/signals', 'dist/types/core/attribution.d.ts');
  const windowDoc = /one taken while already enabled opens a fresh window over\s*\*\s*the ring buffers and folds/.test(types);
  const combineDoc = /Options combine across holds by the most demanding value per key/.test(types);
  const r = h.nodeJson(
    `import { createEffect, createMemo, createRoot, createSignal, flush } from "solid-js";
     import { attribution } from "solid-js/attribution";
     const releaseA = attribution.enable({ log: false });
     const [a, setA] = createSignal(0);
     createRoot(() => {
       const double = createMemo(() => a() * 2, { name: "double" });
       createEffect(() => double(), () => {});
     });
     flush(); setA(1); flush();
     const before = attribution.history("rerun").length;
     const releaseB = attribution.enable({ log: false });
     const after = attribution.history("rerun").length;
     setA(2); flush();
     const later = attribution.history("rerun").length;
     releaseB(); releaseA();
     console.log(JSON.stringify({ before, after, later }));
     process.exit(0);`,
    { conditions: ['browser', 'development'] },
  );
  const freshWindow = r.before > 0 && r.after === 0 && r.later > 0;
  return {
    reproduces: windowDoc && combineDoc && freshWindow,
    observed: `rerun history before a second enable(): ${r.before}, right after it: ${r.after}, after one more write: ${r.later}; fresh-window JSDoc ${windowDoc ? 'present' : 'absent'}; most-demanding combination JSDoc ${combineDoc ? 'present' : 'absent'}`,
  };
}
