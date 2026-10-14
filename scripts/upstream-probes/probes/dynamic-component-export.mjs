export const claim =
  '`dynamicComponent` is exported from `solid-js` (client and server entries; `@solidjs/web` re-exports it) as the component-only twin of `@solidjs/web`\'s `dynamic()` — same contract minus the tag arm: a tag-name source is a compile error and a bundle whose only dynamic mount is `dynamicComponent` retains no element runtime (the SVG/MathML namespace tables a `dynamic()` bundle carries), making it the documented way to mount a server component.';
export const packages = ['solid-js', '@solidjs/web'];

const NAMESPACES = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1998/Math/MathML'];

export async function probe(h) {
  const types = h.read('solid-js', 'types/index.d.ts');
  const serverTypes = h.read('solid-js', 'types/server/index.d.ts');
  const declared = h.read('solid-js', 'types/client/dynamic.d.ts');
  const webTypes = h.read('@solidjs/web', 'types/index.d.ts');
  const webServerTypes = h.read('@solidjs/web', 'types/index.server.d.ts');
  const reexport = /export \{ dynamicComponent \} from "solid-js"/;
  const typed = /export \{ dynamicComponent\b[^}]*\} from "\.\/client\/dynamic\.js"/.test(types) && /export declare const dynamicComponent: \{\s*<C extends Component<any>>/.test(declared);
  const serverTyped = /export \{ dynamicComponent\b[^}]*\} from "\.\/dynamic\.js"/.test(serverTypes);
  const webReexports = reexport.test(webTypes) && reexport.test(webServerTypes);
  const r = h.typecheck(
    `import { dynamicComponent } from "solid-js";
     const A = () => null;
     const ok = dynamicComponent(() => A);
     const bad = dynamicComponent(() => "div");`,
  );
  const tagRejected = r.codes.some((c) => c === 2322 || c === 2345 || c === 2769);
  const bundle = (from, name) => h.viteBuild({ 'main.js': `import { ${name} } from "${from}";\nconst A = () => null;\nwindow.C = ${name}(() => A);\n` });
  const withTag = bundle('@solidjs/web', 'dynamic');
  const componentOnly = bundle('solid-js', 'dynamicComponent');
  const retains = (b) => NAMESPACES.every((ns) => b.js.includes(ns));
  const built = withTag.code === 0 && componentOnly.code === 0;
  const runtimeDropped = built && retains(withTag) && !NAMESPACES.some((ns) => componentOnly.js.includes(ns));
  return {
    reproduces: typed && serverTyped && webReexports && tagRejected && runtimeDropped,
    observed: `solid-js client types export dynamicComponent: ${typed}; server types: ${serverTyped}; @solidjs/web re-exports it (client and server): ${webReexports}; tag-name source rejected: ${tagRejected} (codes ${r.codes.join(',') || 'none'}); ${built ? `namespace tables in a dynamic() bundle: ${retains(withTag)} (${withTag.js.length} B), in a dynamicComponent() bundle: ${NAMESPACES.some((ns) => componentOnly.js.includes(ns))} (${componentOnly.js.length} B)` : `vite build failed: ${(withTag.code ? withTag : componentOnly).output.trim().split('\n')[0]}`}`,
  };
}
