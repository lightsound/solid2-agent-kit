export const claim =
  'Since 2.0.0-rc.20, the dev build warns `[LOADING_ON_ACCESSOR]` when a `<Loading>` boundary\'s `on` receives a function (an accessor or `() => route()`): `on` takes the dependency\'s value, the function is never called, and the boundary never re-arms. Passing the value warns nothing; the prod build does not check.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { Loading, createComponent, createRoot, createSignal, flush } from "solid-js";
createRoot(() => {
  const [id] = createSignal(1);
  createComponent(Loading, { on: () => id(), fallback: "fb", get children() { return "x"; } });
});
createRoot(() => {
  const [id] = createSignal(1);
  createComponent(Loading, { on: id(), fallback: "fb", get children() { return "x"; } });
});
flush();
console.log(JSON.stringify({ done: true }));`;

export async function probe(h) {
  const dev = h.node(script, { conditions: ['browser', 'development'] });
  const prod = h.node(script, { conditions: ['browser'] });
  const occurrences = (s) => s.split('[LOADING_ON_ACCESSOR]').length - 1;
  return {
    reproduces: occurrences(dev.stderr) >= 1 && occurrences(prod.stderr) === 0 && dev.stdout.includes('"done":true'),
    observed: `dev stderr mentions [LOADING_ON_ACCESSOR] ${occurrences(dev.stderr)}x (the accessor arm; the value arm is silent), prod ${occurrences(prod.stderr)}x`,
  };
}
