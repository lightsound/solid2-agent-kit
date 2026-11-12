export const claim =
  '`createReaction(fn)` returns a tracker: `fn` does not run when the reaction is created or when sources change unobserved — it runs once (on the effect flush) after a source read inside a `track(() => …)` call changes, and does not run again until the tracker is called again (re-armed, typically from inside `fn`).';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { createRoot, createSignal, createReaction } from "solid-js";
const tick = () => new Promise((r) => setTimeout(r, 0));
let fires = 0, setCount, track, read;
createRoot(() => {
  const [count, set] = createSignal(0);
  setCount = set; read = count;
  track = createReaction(() => { fires++; });
});
setCount(1); await tick();            // unarmed: no fire
const before = fires;
track(() => read());                  // arm
setCount(2); await tick();            // fires once
setCount(3); await tick();            // not re-armed: no second fire
const afterBurst = fires;
track(() => read());                  // re-arm
setCount(4); await tick();            // fires again
console.log(JSON.stringify({ before, afterBurst, total: fires }));`;

export async function probe(h) {
  const dev = h.nodeJson(script, { conditions: ['browser', 'development'] });
  const prod = h.nodeJson(script, { conditions: ['browser'] });
  const ok = (r) => r.before === 0 && r.afterBurst === 1 && r.total === 2;
  return {
    reproduces: ok(dev) && ok(prod),
    observed: `dev: ${JSON.stringify(dev)}; prod: ${JSON.stringify(prod)} (expected before 0, afterBurst 1, total 2)`,
  };
}
