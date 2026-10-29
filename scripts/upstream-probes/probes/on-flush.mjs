export const claim =
  'Since 2.0.0-rc.19, `onFlush(fn)` from `solid-js` runs `fn` once right after the pending flush, without waiting on async work: a write made there is its own update, not held by async work another write in the same frame started. It is meant for event handlers and effect callbacks; in a component body or a computation, dev warns `ON_FLUSH_IN_OWNED_SCOPE`.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const types = h.read('@solidjs/signals', 'dist/types/signals.d.ts');
  const typed = /export declare function onFlush\(callback: \(\) => void\): void;/.test(types);
  const r = h.nodeJson(
    `import { createRoot, createSignal, createMemo, onFlush, isPending, flush } from "solid-js";
     const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
     onFlush(() => { ran += 1; api.setOpen(false); });
     api.setNav(1); flush();
     const atFlush = { ran, open: api.open() };
     await sleep(0); flush();
     const after = { ran, open: api.open(), dataPending: isPending(() => api.data()) };
     await sleep(60); flush();
     console.log(JSON.stringify({ exported: typeof onFlush, atFlush, after, ranLater: ran }));
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
  return {
    reproduces:
      typed &&
      r.exported === 'function' &&
      r.atFlush.ran === 0 &&
      r.atFlush.open === true &&
      r.after.ran === 1 &&
      r.after.open === false &&
      r.after.dataPending === true &&
      r.ranLater === 1 &&
      warned,
    observed: `signature typed: ${typed}; runtime export ${r.exported}; at the registering frame's flush: ran ${r.atFlush.ran}, open ${r.atFlush.open}; after it: ran ${r.after.ran}, its write landed (open ${r.after.open}) while the same frame's async memo was still pending (${r.after.dataPending}); ran exactly once (${r.ranLater}); ON_FLUSH_IN_OWNED_SCOPE in a computation: ${warned}`,
  };
}
