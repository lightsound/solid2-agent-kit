export const claim =
  'Since 2.0.0-rc.21, `createOwner` is not part of `solid-js`\'s public types: the package\'s main type entry does not export it, and it is declared only in `solid-js/internal` (the renderer-facing surface), like the boundary primitives behind `Errored`/`Loading`/`Reveal`. It remains a runtime export of `solid-js` for the renderers. Application code hosts a scope with `createRoot()` (passing its `dispose` around as a plain function) and re-enters it with `runWithOwner()`.';
export const packages = ['solid-js'];

export async function probe(h) {
  const mainTypes = h.read('solid-js', 'types/index.d.ts');
  const internalTypes = h.read('solid-js', 'types/internal.d.ts');
  const r = h.nodeJson(
    `import * as solid from "solid-js";
     console.log(JSON.stringify({ runtime: typeof solid.createOwner }));`,
    { conditions: ['browser'] },
  );
  const mainExports = /createOwner/.test(mainTypes);
  const internalDeclares = /export declare const createOwner/.test(internalTypes);
  return {
    reproduces: !mainExports && internalDeclares && r.runtime === 'function',
    observed: `solid-js types/index.d.ts mentions createOwner: ${mainExports}; types/internal.d.ts declares it: ${internalDeclares}; runtime export: ${r.runtime}`,
  };
}
