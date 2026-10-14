export const claim =
  'Link preloading is opt-in: `createRouter({ preloadLinks })` takes link preload strategies (`intentPreload()` for hover/focus/touch, `tapPreload()`, `viewportPreload()`, `eagerPreload()`, from `@solidjs/router`) and preloads nothing by default; a boolean `preloadLinks` only warns in dev. `usePreloadRoute()` still warms a route by hand, and an anchor\'s `preload="false"` opts one link out.';
export const packages = ['@solidjs/router'];

export async function probe(h) {
  const index = h.read('@solidjs/router', 'dist/index.d.ts');
  const factory = h.read('@solidjs/router', 'dist/routers/factory.d.ts');
  const preload = h.read('@solidjs/router', 'dist/preload.d.ts');
  const types = h.read('@solidjs/router', 'dist/types.d.ts');
  const runtime = h.read('@solidjs/router', 'dist/index.js');
  const strategies = ['intentPreload', 'tapPreload', 'viewportPreload', 'eagerPreload'];
  const exported = /export \{ eagerPreload, intentPreload, tapPreload, viewportPreload \} from "\.\/preload\.js"/.test(index) &&
    strategies.every((s) => new RegExp(`export declare const ${s}: `).test(preload));
  const option = /preloadLinks\?: LinkPreload \| readonly LinkPreload\[\]/.test(factory);
  const noneByDefault = /None by default/.test(factory);
  const booleanWarns = /typeof config\.preloadLinks === "boolean"/.test(runtime) && /preloads nothing by default/.test(runtime);
  const manual = /export \{ usePreloadRoute \} from "\.\/preloadRoute\.js"/.test(index);
  const anchorOptOut = /preload\?: boolean \| "false" \| "viewport" \| "eager"/.test(types);
  return {
    reproduces: exported && option && noneByDefault && booleanWarns && manual && anchorOptOut,
    observed: `strategies exported: ${exported}; preloadLinks typed as strategies: ${option}; "None by default" documented: ${noneByDefault}; boolean preloadLinks warns in dev: ${booleanWarns}; usePreloadRoute exported: ${manual}; anchor preload attribute typed with "false": ${anchorOptOut}`,
  };
}
