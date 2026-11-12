export const claim =
  'In the dev build, invoking an `action()` from a component body or a computation warns `[ACTION_CALLED_IN_OWNED_SCOPE]`: the call joins that scope\'s lifetime instead of running as a user gesture. Calling the same action from outside any owned scope (an event handler\'s position) warns nothing. The prod build does not check.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { action, createMemo, createRoot, flush } from "solid-js";
const act = action(async () => 1);
createRoot(() => { createMemo(() => { act(); return 1; }); });
flush();
console.log(JSON.stringify({ inScope: true }));`;

const control = `import { action, createRoot, flush } from "solid-js";
const act = action(async () => 1);
createRoot(() => {});
act();
flush();
console.log(JSON.stringify({ outside: true }));`;

export async function probe(h) {
  const dev = h.node(script, { conditions: ['browser', 'development'] });
  const ctrl = h.node(control, { conditions: ['browser', 'development'] });
  const prod = h.node(script, { conditions: ['browser'] });
  const has = (s) => s.includes('[ACTION_CALLED_IN_OWNED_SCOPE]');
  return {
    reproduces: has(dev.stderr) && !has(ctrl.stderr) && !has(prod.stderr),
    observed: `dev: called in a computation — ${has(dev.stderr) ? 'warned' : 'silent'}; called outside a scope — ${has(ctrl.stderr) ? 'warned' : 'silent'}; prod in-scope — ${has(prod.stderr) ? 'warned' : 'silent'}`,
  };
}
