export const claim = 'DEV.attribution no longer exists; the engine lives behind solid-js/attribution.';
export const packages = ['solid-js'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { DEV } from "solid-js";
     import { attribution } from "solid-js/attribution";
     console.log(JSON.stringify({ dev: !!DEV, onDev: !!DEV && "attribution" in DEV, subpath: typeof attribution?.enable === "function" }));`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces: r.dev && !r.onDev && r.subpath,
    observed: `DEV ${r.dev ? 'present' : 'absent'} in the dev build; DEV.attribution ${r.onDev ? 'present' : 'absent'}; solid-js/attribution ${r.subpath ? 'exports attribution.enable' : 'lacks attribution.enable'}`,
  };
}
