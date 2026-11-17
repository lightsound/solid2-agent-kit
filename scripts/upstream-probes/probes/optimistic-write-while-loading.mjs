export const claim =
  'Since 2.0.0, an optimistic write against a source that has answered before but is loading a new answer (an input changed) warns `[OPTIMISTIC_WRITE_WHILE_LOADING]` once per source in the dev build; the guess is still made, composed on the previous answer, and the new answer replaces it when it lands. The prod build does not check.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { action, createOptimisticStore, createSignal, createRoot, flush } from "solid-js";
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
let setQ, write, read;
createRoot(() => {
  const [q, sq] = createSignal(1);
  setQ = sq;
  const [store, setStore] = createOptimisticStore(() => {
    const current = q();
    return new Promise((res) => setTimeout(() => res({ q: current, x: 0 }), 40));
  });
  read = () => ({ q: store.q, x: store.x });
  write = action(function* () { setStore((d) => { d.x = 99; }); yield tick(5); });
});
flush(); await tick(60); flush();
const first = read();
setQ(2); flush();
write(); flush(); await tick(10); flush();
const during = read();
await tick(60); flush();
const second = read();
console.log(JSON.stringify({ first, during, second }));`;

export async function probe(h) {
  const dev = h.nodeJson(script, { conditions: ['browser', 'development'] });
  const prod = h.nodeJson(script, { conditions: ['browser'] });
  const occurrences = (s) => s.split('[OPTIMISTIC_WRITE_WHILE_LOADING]').length - 1;
  const composed = dev.first.x === 0 && dev.during.q === 1 && dev.during.x === 99;
  const replaced = dev.second.q === 2 && dev.second.x === 0;
  return {
    reproduces: occurrences(dev.stderr) >= 1 && occurrences(dev.stderr) <= 3 && occurrences(prod.stderr) === 0 && composed && replaced,
    observed: `dev stderr mentions [OPTIMISTIC_WRITE_WHILE_LOADING] ${occurrences(dev.stderr)}x, prod ${occurrences(prod.stderr)}x; during the reload the guess composed on the previous answer (${JSON.stringify(dev.during)}); the new answer replaced it (${JSON.stringify(dev.second)})`,
  };
}
