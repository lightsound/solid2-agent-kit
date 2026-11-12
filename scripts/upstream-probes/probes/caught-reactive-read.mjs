export const claim =
  'Since 2.0.0-rc.21, the dev build warns `[CAUGHT_REACTIVE_READ]` once per computation when a computation catches a reactive read\'s throw itself — a `NotReadyError` (the source has no value yet) or the source\'s error — and completes with a value: the catch masks the load or hides the error from the boundaries. The runtime\'s own catches (boundaries, `isPending`, `latest`) never warn. The prod build does not check.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { createMemo, createRoot, createSignal, flush } from "solid-js";
const tick = () => new Promise((r) => setTimeout(r, 0));
let resolve;
let maskedValue;
createRoot(() => {
  const data = createMemo(() => new Promise((res) => { resolve = res; }));
  const masked = createMemo(() => { try { return data(); } catch { return "masked"; } });
  maskedValue = masked();
  const [plain] = createSignal(7);
  const honest = createMemo(() => { try { return plain(); } catch { return 0; } });
  honest();
});
flush();
await tick(); flush();
resolve("real"); await tick(); flush();
console.log(JSON.stringify({ maskedValue }));`;

export async function probe(h) {
  const dev = h.node(script, { conditions: ['browser', 'development'] });
  const prod = h.node(script, { conditions: ['browser'] });
  const occurrences = (s) => s.split('[CAUGHT_REACTIVE_READ]').length - 1;
  const out = JSON.parse(dev.stdout.trim().split('\n').pop());
  return {
    reproduces: occurrences(dev.stderr) >= 1 && occurrences(prod.stderr) === 0 && out.maskedValue === 'masked',
    observed: `dev stderr mentions [CAUGHT_REACTIVE_READ] ${occurrences(dev.stderr)}x (the catching memo only; a try/catch over a settled signal is silent), prod ${occurrences(prod.stderr)}x; the catching memo completed with ${JSON.stringify(out.maskedValue)} while its source was still pending`,
  };
}
