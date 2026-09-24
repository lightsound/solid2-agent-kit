export const claim = 'A store setter called in a component or root body throws [REACTIVE_WRITE_IN_OWNED_SCOPE] in the dev build.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { createRoot, createStore, flush } from "solid-js";
     let error = null;
     try {
       createRoot(() => { const [, setState] = createStore({ a: 1 }); setState((draft) => { draft.a = 2; }); });
       flush();
     } catch (e) { error = String(e?.message ?? e); }
     console.log(JSON.stringify({ error }));`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces: r.error?.includes('[REACTIVE_WRITE_IN_OWNED_SCOPE]') ?? false,
    observed: r.error ? `throws: ${r.error.slice(0, 120)}` : 'no throw',
  };
}
