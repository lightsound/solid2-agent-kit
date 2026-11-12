export const claim =
  'In the dev build, an optimistic write (a draft write inside an `action`) against a source whose first answer has not landed yet warns `[OPTIMISTIC_WRITE_BEFORE_LOAD]`, and no guess is made — the write is not shown. The same write after the first answer lands is guessed silently. The prod build does not check.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { action, createOptimisticStore, createRoot, flush } from "solid-js";
const tick = () => new Promise((r) => setTimeout(r, 0));
let write;
createRoot(() => {
  const [cart, setCart] = createOptimisticStore(() => new Promise((res) => { setTimeout(() => res({ x: 0 }), 60); }));
  write = action(function* () { setCart((draft) => { draft.x = 1; }); yield new Promise((r) => setTimeout(r, 5)); });
});
write();
flush(); await tick(); flush();
await new Promise((r) => setTimeout(r, 90)); flush();
write();
flush(); await tick(); flush();
console.log(JSON.stringify({ done: true }));`;

export async function probe(h) {
  const dev = h.node(script, { conditions: ['browser', 'development'] });
  const prod = h.node(script, { conditions: ['browser'] });
  const occurrences = (s) => s.split('[OPTIMISTIC_WRITE_BEFORE_LOAD]').length - 1;
  return {
    reproduces: occurrences(dev.stderr) >= 1 && occurrences(dev.stderr) <= 3 && occurrences(prod.stderr) === 0,
    observed: `dev stderr mentions [OPTIMISTIC_WRITE_BEFORE_LOAD] ${occurrences(dev.stderr)}x (the pre-load write only; the post-load write is silent), prod ${occurrences(prod.stderr)}x`,
  };
}
