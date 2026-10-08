export const claim =
  'Only `on` + uppercase (`onClick`) binds an event: both JSX compilers (`@solidjs/compiler`, `@solidjs/babel-plugin` under `compiler: "babel"`) compile a lowercase `onclick` / `onmouseover` and a leftover 1.x `on:click` to a plain `setAttribute`, so neither receives the handler, and the dev build warns `LOWERCASE_EVENT_ATTRIBUTE` when a function reaches such an attribute.';
export const packages = ['@solidjs/compiler', '@solidjs/babel-plugin', '@solidjs/web'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { createRequire } from "node:module";
     const require = createRequire(import.meta.url);
     const { transform } = await import("@solidjs/compiler");
     const babel = require("@babel/core");
     const solid = require("@solidjs/babel-plugin");
     const code = 'const fn = () => 1; export const A = () => <div onclick={fn} onClick={fn} on:click={fn} />;';
     const native = transform(code, { generate: "dom", filename: "a.jsx", moduleName: "@solidjs/web" }).code;
     const viaBabel = babel.transformSync(code, {
       filename: "a.jsx", babelrc: false, configFile: false,
       plugins: [[solid, { moduleName: "@solidjs/web", generate: "dom" }]],
     }).code;
     const shape = (out) => ({
       lowercaseAttr: /setAttribute\\([^,]+, "onclick", fn\\)/.test(out),
       namespacedAttr: /setAttribute\\([^,]+, "on:click", fn\\)/.test(out),
       camelBound: (out.match(/\\._\\$\\$click = fn/g) || []).length,
     });
     console.log(JSON.stringify({ native: shape(native), babel: shape(viaBabel) }));
     process.exit(0);`,
  );
  const dev = h.read('@solidjs/web', 'dist/web.dev.js');
  const devWarning = /code: "LOWERCASE_EVENT_ATTRIBUTE"/.test(dev);
  const ok = (s) => s.lowercaseAttr && s.namespacedAttr && s.camelBound === 1;
  const describe = (s) =>
    `onclick ${s.lowercaseAttr ? 'setAttribute' : 'bound'}, on:click ${s.namespacedAttr ? 'setAttribute' : 'bound'}, onClick delegated ${s.camelBound}x`;
  return {
    reproduces: ok(r.native) && ok(r.babel) && devWarning,
    observed: `@solidjs/compiler: ${describe(r.native)}; @solidjs/babel-plugin: ${describe(r.babel)}; LOWERCASE_EVENT_ATTRIBUTE in the dev build: ${devWarning}`,
  };
}
