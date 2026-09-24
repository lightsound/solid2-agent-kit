export const claim = 'merge / omit return read-only live views for plain-object inputs too: assigning onto the result is a silent no-op.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { merge, omit } from "solid-js";
     function assign(view) {
       try { view.a = 5; return view.a === 1 ? "ignored" : "written"; } catch (e) { return "threw"; }
     }
     console.log(JSON.stringify({ merge: assign(merge({ a: 1 }, { b: 2 })), omit: assign(omit({ a: 1, b: 2 }, "b")) }));`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces: r.merge === 'ignored' && r.omit === 'ignored',
    observed: `assignment onto merge(): ${r.merge}; onto omit(): ${r.omit}`,
  };
}
