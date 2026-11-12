export const claim =
  'In the dev build, an `onSettled` registered from an unowned scope (out-of-band, e.g. after an `await` with no owner re-entered) whose callback returns a cleanup warns `[SETTLED_CLEANUP_UNOWNED]`: there is no owner to attach the cleanup to, so it never runs. An `onSettled` registered in a component body warns nothing. The prod build does not check.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { createRoot, flush, onSettled } from "solid-js";
const tick = () => new Promise((r) => setTimeout(r, 0));
createRoot(() => {
  onSettled(() => () => {});
  (async () => { await tick(); onSettled(() => () => {}); })();
});
flush();
await tick(); await tick(); flush();
console.log(JSON.stringify({ done: true }));`;

export async function probe(h) {
  const dev = h.node(script, { conditions: ['browser', 'development'] });
  const prod = h.node(script, { conditions: ['browser'] });
  const occurrences = (s) => s.split('[SETTLED_CLEANUP_UNOWNED]').length - 1;
  return {
    reproduces: occurrences(dev.stderr) >= 1 && occurrences(prod.stderr) === 0,
    observed: `dev stderr mentions [SETTLED_CLEANUP_UNOWNED] ${occurrences(dev.stderr)}x (the out-of-band registration only; the in-body one is silent), prod ${occurrences(prod.stderr)}x`,
  };
}
