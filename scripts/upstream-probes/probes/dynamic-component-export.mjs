export const claim =
  '`dynamicComponent` is exported from `@solidjs/web` (and its server entry) as the component-only twin of `dynamic()` — same contract minus the tag arm: a tag-name source is a compile error and using it retains no element runtime, making it the documented way to mount a server component.';
export const packages = ['@solidjs/web'];

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
  return {
    reproduces: typed && serverTyped && tagRejected,
    observed: `client types export dynamicComponent: ${typed}; server types: ${serverTyped}; tag-name source rejected: ${tagRejected} (codes ${r.codes.join(',') || 'none'})`,
  };
}
