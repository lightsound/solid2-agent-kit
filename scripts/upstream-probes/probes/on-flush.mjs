export const claim =
  'Since 2.0.0-rc.19, `onFlush(fn)` from `solid-js` runs `fn` once right after the pending flush, without waiting on async work: a write made there is its own update, not held by async work another write in the same frame started. It is meant for event handlers and effect callbacks; in a component body or a computation, dev warns `ON_FLUSH_IN_OWNED_SCOPE`.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const types = h.read('@solidjs/signals', 'dist/types/signals.d.ts');
  const typed = /export declare function onFlush\(callback: \(\) => void\): void;/.test(types);
  const r = h.nodeJson(
    `import { createRoot, createSignal, createMemo, onFlush, isPending, flush } from "solid-js";
     const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
     async function scenario(useOnFlush) {
       let api;
       createRoot(() => {
         const [nav, setNav] = createSignal(0);
         const [open, setOpen] = createSignal(true);
         const data = createMemo(async () => { const n = nav(); await sleep(30); return n; });
         createMemo(() => { try { return data(); } catch { return undefined; } });
         api = { setNav, open, setOpen, data };
       });
       await sleep(50); flush();
       let ran = 0;
       if (useOnFlush) onFlush(() => { ran += 1; api.setOpen(false); });
       else api.setOpen(false);
       api.setNav(1); flush();
       const atFlush = { ran, open: api.open() };
       await sleep(0); flush();
       const after = { ran, open: api.open(), dataPending: isPending(() => api.data()) };
       await sleep(60); flush();
       return { atFlush, after, ranLater: ran };
     }
     const flushed = await scenario(true);
     const plain = await scenario(false);
     console.log(JSON.stringify({ exported: typeof onFlush, flushed, plain }));
     process.exit(0);`,
    { conditions: ['browser', 'development'] },
  );
  const w = h.node(
    `import { createRoot, createMemo, onFlush } from "solid-js";
     createRoot(() => { createMemo(() => { onFlush(() => {}); return 1; }); });
     console.log(JSON.stringify({}));`,
    { conditions: ['browser', 'development'] },
  );
  const warned = w.stderr.includes('[ON_FLUSH_IN_OWNED_SCOPE]');
  const f = r.flushed;
  const p = r.plain;
  return {
    reproduces:
      typed &&
      r.exported === 'function' &&
      // Control: a plain write in the frame lands with that frame's flush.
      p.atFlush.open === false &&
      // The onFlush write does not: it is a separate, later update ...
      f.atFlush.ran === 0 &&
      f.atFlush.open === true &&
      // ... that lands on its own while the frame's async work is still pending.
      f.after.ran === 1 &&
      f.after.open === false &&
      f.after.dataPending === true &&
      f.ranLater === 1 &&
      warned,
    observed: `signature typed: ${typed}; runtime export ${r.exported}; control (plain write): landed with the frame's flush (open ${p.atFlush.open}); onFlush arm: at the registering frame's flush ran ${f.atFlush.ran}, open ${f.atFlush.open}; after it: ran ${f.after.ran}, its write landed (open ${f.after.open}) while the same frame's async memo was still pending (${f.after.dataPending}); ran exactly once (${f.ranLater}); ON_FLUSH_IN_OWNED_SCOPE in a computation: ${warned}`,
  };
}
