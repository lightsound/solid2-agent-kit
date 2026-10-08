export const claim =
  '`dynamicComponent` is exported from `@solidjs/web` (and its server entry) as the component-only twin of `dynamic()` — same contract minus the tag arm: a tag-name source is a compile error and a bundle whose only dynamic mount is `dynamicComponent` retains no element runtime (the SVG/MathML namespace tables a `dynamic()` bundle carries), making it the documented way to mount a server component.';
export const packages = ['@solidjs/web'];

const NAMESPACES = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1998/Math/MathML'];

export async function probe(h) {
  const types = h.read('@solidjs/web', 'types/index.d.ts');
  const serverTypes = h.read('@solidjs/web', 'types/index.server.d.ts');
  const typed = /export declare function dynamicComponent<C extends Component<any>>/.test(types);
  const serverTyped = /export declare function dynamicComponent<C extends Component<any>>/.test(serverTypes);
  const r = h.typecheck(
    `import { dynamicComponent } from "@solidjs/web";
     const A = () => null;
     const ok = dynamicComponent(() => A);
     const bad = dynamicComponent(() => "div");`,
  );
  const tagRejected = r.codes.some((c) => c === 2322 || c === 2345 || c === 2769);
  const bundle = (name) => h.viteBuild({ 'main.js': `import { ${name} } from "@solidjs/web";\nconst A = () => null;\nwindow.C = ${name}(() => A);\n` });
  const withTag = bundle('dynamic');
  const componentOnly = bundle('dynamicComponent');
  const retains = (b) => NAMESPACES.every((ns) => b.js.includes(ns));
  const built = withTag.code === 0 && componentOnly.code === 0;
  const runtimeDropped = built && retains(withTag) && !NAMESPACES.some((ns) => componentOnly.js.includes(ns));
  return {
    reproduces: typed && serverTyped && tagRejected && runtimeDropped,
    observed: `client types export dynamicComponent: ${typed}; server types: ${serverTyped}; tag-name source rejected: ${tagRejected} (codes ${r.codes.join(',') || 'none'}); ${built ? `namespace tables in a dynamic() bundle: ${retains(withTag)} (${withTag.js.length} B), in a dynamicComponent() bundle: ${NAMESPACES.some((ns) => componentOnly.js.includes(ns))} (${componentOnly.js.length} B)` : `vite build failed: ${(withTag.code ? withTag : componentOnly).output.trim().split('\n')[0]}`}`,
  };
}
