export const claim =
  'Since 2.0.0, a store setter whose draft descends into a value that is another store still loading its first answer drops the write — the draft base would be that store\u2019s contents, which do not exist yet — and the dev build warns `[STORE_WRITE_THROUGH_LOADING]`; production drops the write the same way, without the warning. When the inner store\u2019s first answer lands, it is what shows.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { createRoot, createStore, flush } from "solid-js";
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
let setOuter, readX;
createRoot(() => {
  const [inner] = createStore(() => new Promise((res) => setTimeout(() => res({ x: 0 }), 50)));
  const [outer, so] = createStore(() => ({ child: inner }));
  setOuter = so;
  readX = () => outer.child.x;
});
setOuter((s) => { s.child.x = 9; });
await tick(90); flush();
console.log(JSON.stringify({ x: readX() }));`;

export async function probe(h) {
  const dev = h.nodeJson(script, { conditions: ['browser', 'development'] });
  const prod = h.nodeJson(script, { conditions: ['browser'] });
  const occurrences = (s) => s.split('[STORE_WRITE_THROUGH_LOADING]').length - 1;
  return {
    reproduces:
      occurrences(dev.stderr) >= 1 &&
      occurrences(dev.stderr) <= 3 &&
      occurrences(prod.stderr) === 0 &&
      dev.x === 0 &&
      prod.x === 0,
    observed: `dev stderr mentions [STORE_WRITE_THROUGH_LOADING] ${occurrences(dev.stderr)}x, prod ${occurrences(prod.stderr)}x; after the inner store loaded, child.x is ${dev.x} in dev and ${prod.x} in prod (the write of 9 was dropped in both)`,
  };
}
