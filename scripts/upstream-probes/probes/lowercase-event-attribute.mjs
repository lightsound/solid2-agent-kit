export const claim =
  'Only `on` + uppercase (`onClick`) binds an event: both JSX compilers (`@solidjs/compiler`, `@solidjs/babel-plugin` under `compiler: "babel"`) compile a lowercase `onclick` / `onmouseover` to a plain `setAttribute`, so it never receives the handler, and the dev build warns `LOWERCASE_EVENT_ATTRIBUTE` when a function reaches such an attribute; a leftover 1.x `on:click` on a native element is a compile error in both compilers (since 2.0.0-rc.17).';
export const packages = ['@solidjs/compiler', '@solidjs/babel-plugin', '@solidjs/web'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { createRequire } from "node:module";
     const require = createRequire(import.meta.url);
     const { transform } = await import("@solidjs/compiler");
     const babel = require("@babel/core");
     const solid = require("@solidjs/babel-plugin");
     const code = 'const fn = () => 1; export const A = () => <div onclick={fn} onClick={fn} />;';
     const removed = 'const fn = () => 1; export const B = () => <div on:click={fn} />;';
     const native = transform(code, { generate: "dom", filename: "a.jsx", moduleName: "@solidjs/web" }).code;
     const viaBabel = (src) => babel.transformSync(src, {
       filename: "a.jsx", babelrc: false, configFile: false,
       plugins: [[solid, { moduleName: "@solidjs/web", generate: "dom" }]],
     }).code;
     const shape = (out) => ({
       lowercaseAttr: /setAttribute\\([^,]+, "onclick", fn\\)/.test(out),
       camelBound: (out.match(/\\._\\$\\$click = fn/g) || []).length,
     });
     const error = (fn) => { try { fn(); return null; } catch (e) { return String(e.message).split("\\n")[0].slice(0, 160); } };
     console.log(JSON.stringify({
       native: shape(native),
       babel: shape(viaBabel(code)),
       namespaced: {
         native: error(() => transform(removed, { generate: "dom", filename: "a.jsx", moduleName: "@solidjs/web" })),
         babel: error(() => viaBabel(removed)),
       },
     }));
     process.exit(0);`,
  );
  const dev = h.read('@solidjs/web', 'dist/web.dev.js');
  const devWarning = /code: "LOWERCASE_EVENT_ATTRIBUTE"/.test(dev);
  const ok = (s) => s.lowercaseAttr && s.camelBound === 1;
  const rejects = (message) => /`on:` namespace, which was removed in Solid 2\.0/.test(message ?? '');
  const describe = (s) => `onclick ${s.lowercaseAttr ? 'setAttribute' : 'bound'}, onClick delegated ${s.camelBound}x`;
  const describeError = (message) => (message ? `rejects on:click (${message})` : 'compiles on:click');
  return {
    reproduces: ok(r.native) && ok(r.babel) && devWarning && rejects(r.namespaced.native) && rejects(r.namespaced.babel),
    observed: `@solidjs/compiler: ${describe(r.native)}, ${describeError(r.namespaced.native)}; @solidjs/babel-plugin: ${describe(r.babel)}, ${describeError(r.namespaced.babel)}; LOWERCASE_EVENT_ATTRIBUTE in the dev build: ${devWarning}`,
  };
}
