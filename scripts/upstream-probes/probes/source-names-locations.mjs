export const claim =
  "The compiler's `sourceNames` has a `locations` kind: with a `filename`, `transform()` gives `createComponent` a fourth `file:line:col` argument and binding options a `loc` beside `name`, and the standalone `transformSourceNames` pass writes `loc` into primitive options (paths relative to `root`); the Vite plugin turns it on under `vite dev` only, so an observe build opts in with `sourceNames: { locations: true }`; dev diagnostics print it as an `at file:line:col` line.";
export const packages = ['@solidjs/compiler', '@solidjs/vite-plugin', 'solid-js'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { transform, transformSourceNames } from "@solidjs/compiler";
     const code = 'import { createSignal } from "solid-js";\\nconst Home = () => null;\\nconst App = () => {\\n  const [n] = createSignal(0);\\n  return <div class={n() ? "a" : "b"}><Home /></div>;\\n};';
     const filename = process.cwd() + "/src/App.jsx";
     const options = { generate: "dom", filename, root: process.cwd(), moduleName: "@solidjs/web", dev: true };
     const on = transform(code, { ...options, sourceNames: { components: true, bindings: true, locations: true } }).code;
     const off = transform(code, { ...options, sourceNames: { components: true, bindings: true, locations: false } }).code;
     const primitives = transformSourceNames(code, { filename, root: process.cwd(), locations: true }).code;
     console.log(JSON.stringify({
       component: /createComponent\\(Home, \\{\\}, "Home", "src\\/App\\.jsx:5:\\d+"\\)/.test(on),
       binding: /name: "div\\.class",\\s*loc: "src\\/App\\.jsx:5:\\d+"/.test(on),
       primitive: /createSignal\\(0, \\{\\s*name: "n",\\s*loc: "src\\/App\\.jsx:4:\\d+"\\s*\\}\\)/.test(primitives),
       offHasNoLoc: !/loc:|"src\\/App\\.jsx:/.test(off),
     }));`,
  );
  const compilerTypes = h.read('@solidjs/compiler', 'types.d.ts');
  const pluginTypes = h.read('@solidjs/vite-plugin', 'dist/types/src/index.d.ts');
  const typed = /locations\?: boolean;/.test(compilerTypes) && /sourceNames\.locations/.test(compilerTypes) && /export function transformSourceNames\(/.test(compilerTypes);
  const pluginDocumented = /locations/.test(pluginTypes);
  const shared = h.read('@solidjs/signals', 'dist/dev-shared.js');
  const printed = /function locationLine\(/.test(shared) && /\\n  at \$\{locationLine\(/.test(shared);
  return {
    reproduces: r.component && r.binding && r.primitive && r.offHasNoLoc && typed && pluginDocumented && printed,
    observed: `transform() emits locations: component 4th arg ${r.component}, binding loc ${r.binding}; transformSourceNames() primitive loc ${r.primitive}; off leaves none: ${r.offHasNoLoc}; compiler types declare both: ${typed}; plugin types mention it: ${pluginDocumented}; dev runtime prints an "at" line from loc: ${printed}`,
  };
}
