export const claim =
  'The 1.x attribute forms removed in Solid 2 — the `on:`, `oncapture:`, `use:`, `attr:` and `bool:` namespaces and `classList` — are compile errors on native elements in both JSX compilers (since 2.0.0-rc.17), each naming the replacement; `prop:` remains.';
export const packages = ['@solidjs/compiler', '@solidjs/babel-plugin'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { createRequire } from "node:module";
     const require = createRequire(import.meta.url);
     const { transform } = await import("@solidjs/compiler");
     const babel = require("@babel/core");
     const solid = require("@solidjs/babel-plugin");
     const cases = {
       "on:click": '<div on:click={fn} />',
       "oncapture:click": '<div oncapture:click={fn} />',
       "use:x": '<div use:x />',
       "attr:title": '<div attr:title="t" />',
       "bool:hidden": '<div bool:hidden={x} />',
       "classList": '<div classList={{ a: x }} />',
       "prop:value": '<input prop:value={x} />',
     };
     const native = (src) => transform(src, { generate: "dom", filename: "a.jsx", moduleName: "@solidjs/web" }).code;
     const viaBabel = (src) => babel.transformSync(src, { filename: "a.jsx", babelrc: false, configFile: false, plugins: [[solid, { moduleName: "@solidjs/web", generate: "dom" }]] }).code;
     const outcome = (compile, jsx) => { try { compile('const fn = () => 1; const x = 1; export const A = () => ' + jsx + ';'); return null; } catch (e) { return String(e.message).split("\\n")[0].slice(0, 240); } };
     const result = {};
     for (const [name, jsx] of Object.entries(cases)) result[name] = { native: outcome(native, jsx), babel: outcome(viaBabel, jsx) };
     console.log(JSON.stringify(result));
     process.exit(0);`,
  );
  const removed = ['on:click', 'oncapture:click', 'use:x', 'attr:title', 'bool:hidden', 'classList'];
  const cases = { ...Object.fromEntries(removed.map((n) => [n, true])), 'prop:value': true };
  const rejected = (message) => /was removed in Solid 2\.0/.test(message ?? '');
  const allRejected = removed.every((name) => rejected(r[name].native) && rejected(r[name].babel));
  const propKept = r['prop:value'].native === null && r['prop:value'].babel === null;
  const summary = Object.entries(r)
    .filter(([name]) => name in cases)
    .map(([name, o]) => `${name}: compiler ${o.native ? 'error' : 'ok'}, babel ${o.babel ? 'error' : 'ok'}`)
    .join('; ');
  return {
    reproduces: allRejected && propKept,
    observed: `${summary}; sample: ${r['on:click'].native ?? 'none'}`,
  };
}
