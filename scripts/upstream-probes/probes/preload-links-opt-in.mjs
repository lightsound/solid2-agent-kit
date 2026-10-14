export const claim =
  'Link preloading is opt-in: `createRouter({ preloadLinks })` takes link preload strategies (`intentPreload()` for hover/focus/touch and `tapPreload()`, code and data; `viewportPreload()` / `eagerPreload()`, code only by default, from `@solidjs/router`) and preloads nothing by default; a boolean `preloadLinks` is a type error and at runtime only warns in dev. `usePreloadRoute()` warms code (data with `preloadData: true`). The string `preload="false"` opts a link out of every strategy; `preload={false}` type-checks but removes the attribute, so it opts nothing out.';
export const packages = ['@solidjs/router', '@solidjs/web'];

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
  // Runtime behavior, read from the shipped sources.
  const strategiesJs = h.read('@solidjs/router', 'dist/preload.js');
  const events = h.read('@solidjs/router', 'dist/data/events.js');
  const preloadRoute = h.read('@solidjs/router', 'dist/preloadRoute.js');
  const web = h.read('@solidjs/web', 'dist/web.js');
  const defaults =
    /export const intentPreload = \(\{ delay = 20, data = true \} = \{\}\)/.test(strategiesJs) &&
    /export const tapPreload = \(\{ data = true \} = \{\}\)/.test(strategiesJs) &&
    /export const viewportPreload = \(\{ all, data = false,/.test(strategiesJs) &&
    /export const eagerPreload = \(\{ all, data = false \} = \{\}\)/.test(strategiesJs);
  const stringOptOut = (strategiesJs.match(/getAttribute\("preload"\) !== "false"/g) ?? []).length >= 2 && /value !== "false"/.test(strategiesJs);
  const booleanIgnored = /if \(preload && preload !== true\)/.test(events);
  const manualCodeOnly = /options\?\.preloadData\)/.test(preloadRoute);
  const falseRemoves = /if \(value == null \|\| value === false\) node\.removeAttribute\(name\)/.test(web);
  const t = h.typecheck(
    `import { createRouter } from "@solidjs/router";
     createRouter({ routes: [], preloadLinks: true });`,
  );
  const booleanTypeError = t.codes.includes(2322);
  return {
    reproduces: exported && option && noneByDefault && booleanWarns && manual && anchorOptOut && defaults && stringOptOut && booleanIgnored && manualCodeOnly && falseRemoves && booleanTypeError,
    observed: `strategies exported: ${exported}; preloadLinks typed as strategies: ${option}; "None by default" documented: ${noneByDefault}; boolean preloadLinks warns in dev: ${booleanWarns}, ignored at runtime: ${booleanIgnored}, TS2322: ${booleanTypeError} (codes ${t.codes.join(',') || 'none'}); usePreloadRoute exported: ${manual}, data only with preloadData: ${manualCodeOnly}; strategy defaults (intent/tap data, viewport/eager code only): ${defaults}; string preload="false" checked by the strategies: ${stringOptOut}; a false attribute is removed: ${falseRemoves}; anchor preload attribute typed with "false": ${anchorOptOut}`,
  };
}
