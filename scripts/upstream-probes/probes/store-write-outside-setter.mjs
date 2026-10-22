export const claim =
  'A write to the store proxy itself outside a setter (`store.a = 2`, `delete store.a`) is ignored and, in the dev build, warns `[STORE_WRITE_OUTSIDE_SETTER]` once per store object and property; production stays silent.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `
  import { createRoot, createStore, flush } from "solid-js";
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  let after;
  createRoot(() => {
    const [store] = createStore({ a: 1 });
    store.a = 2;
    store.a = 3;
    store.b = 4;
    delete store.a;
    after = JSON.stringify(store);
  });
  flush();
  const codes = warnings.filter((w) => w.includes("[STORE_WRITE_OUTSIDE_SETTER]"));
  console.log(JSON.stringify({ after, codes: codes.length, first: codes[0]?.slice(0, 140) ?? null }));`;

export async function probe(h) {
  const dev = h.nodeJson(script, { conditions: ['browser', 'development'] });
  const prod = h.nodeJson(script, { conditions: ['browser'] });
  const ignored = dev.after === '{"a":1}' && prod.after === '{"a":1}';
  // Three writes to "a" (two sets, one delete) report once; "b" reports once.
  return {
    reproduces: ignored && dev.codes === 2 && prod.codes === 0 && /property "a" outside its setter was ignored/.test(dev.first ?? ''),
    observed: `store after the writes: dev ${dev.after}, prod ${prod.after}; [STORE_WRITE_OUTSIDE_SETTER] warnings: dev ${dev.codes} (${dev.first ?? 'none'}), prod ${prod.codes}`,
  };
}
