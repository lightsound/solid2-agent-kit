export const claim =
  'In the dev build, reading a still-pending async source inside an `onSettled` callback (a forbidden scope for pending reads, like `createTrackedEffect`) warns `[PENDING_ASYNC_FORBIDDEN_SCOPE]`: the callback is not a computation, so nothing re-runs it when the answer lands. The prod build does not check.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { createMemo, createRoot, flush, onSettled } from "solid-js";
const tick = () => new Promise((r) => setTimeout(r, 0));
let resolve;
createRoot(() => {
  const data = createMemo(() => new Promise((res) => { resolve = res; }));
  onSettled(() => { try { data(); } catch {} });
});
flush();
await tick(); flush();
resolve(1); await tick(); flush();
console.log(JSON.stringify({ done: true }));`;

export async function probe(h) {
  const dev = h.node(script, { conditions: ['browser', 'development'] });
  const prod = h.node(script, { conditions: ['browser'] });
  const has = (s) => s.includes('[PENDING_ASYNC_FORBIDDEN_SCOPE]');
  return {
    reproduces: has(dev.stderr) && !has(prod.stderr),
    observed: `dev: pending read inside onSettled — ${has(dev.stderr) ? 'warned [PENDING_ASYNC_FORBIDDEN_SCOPE]' : 'silent'}; prod — ${has(prod.stderr) ? 'warned' : 'silent'}`,
  };
}
