export const claim =
  '`onHydrationEnd(callback)` is exported from `solid-js` (client and server) and marked `@experimental`: it runs once the hydration phase ends (root pass done, streamed `<Loading>` boundaries resumed or cancelled), or in the next microtask when nothing is hydrating — a marker for test tooling, not a signal that hydration succeeded.';
export const packages = ['solid-js'];

export async function probe(h) {
  const index = h.read('solid-js', 'types/index.d.ts');
  const serverIndex = h.read('solid-js', 'types/server/index.d.ts');
  const client = h.read('solid-js', 'types/client/hydration.d.ts');
  const exported = /\bonHydrationEnd\b[^}]*\} from "\.\/client\/hydration\.js"/.test(index) &&
    /\bonHydrationEnd\b[^}]*\} from "\.\/hydration\.js"/.test(serverIndex);
  const experimental = /@experimental\s*\*\/\s*export declare function onHydrationEnd\(callback: \(\) => void\): void;/.test(client);
  const notSuccess = /It does not say hydration succeeded/.test(client);
  const r = h.nodeJson(
    `import { onHydrationEnd } from "solid-js";
     const order = [];
     onHydrationEnd(() => order.push("end"));
     order.push("sync");
     await Promise.resolve();
     console.log(JSON.stringify({ order }));`,
    { conditions: ['browser'] },
  );
  const microtask = r.order.join(',') === 'sync,end';
  return {
    reproduces: exported && experimental && notSuccess && microtask,
    observed: `exported (client and server): ${exported}; @experimental: ${experimental}; "does not say hydration succeeded" documented: ${notSuccess}; outside hydration runs after the sync code: ${r.order.join(',')}`,
  };
}
