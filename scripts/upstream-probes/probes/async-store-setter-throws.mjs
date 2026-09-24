export const claim = 'An async store setter callback throws [ASYNC_STORE_SETTER] in the dev build.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { createStore, flush } from "solid-js";
     const [, setState] = createStore({ a: 1 });
     let error = null;
     try { setState(async (draft) => { draft.a = 2; }); flush(); } catch (e) { error = String(e?.message ?? e); }
     console.log(JSON.stringify({ error }));`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces: r.error?.includes('[ASYNC_STORE_SETTER]') ?? false,
    observed: r.error ? `throws: ${r.error.slice(0, 120)}` : 'no throw',
  };
}
