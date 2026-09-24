export const claim = 'storePath is not exported from solid-js (it remains in @solidjs/signals).';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const r = h.nodeJson(
    `import * as solid from "solid-js";
     import * as signals from "@solidjs/signals";
     console.log(JSON.stringify({ solid: "storePath" in solid, signals: typeof signals.storePath === "function" }));`,
    { conditions: ['browser'] },
  );
  return {
    reproduces: !r.solid && r.signals,
    observed: `solid-js ${r.solid ? 'exports' : 'does not export'} storePath; @solidjs/signals ${r.signals ? 'exports' : 'does not export'} it`,
  };
}
