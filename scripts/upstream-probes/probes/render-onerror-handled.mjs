export const claim =
  "renderToString's onError hears handled failures too (a context with handling: \"fallback\" for an <Errored>-contained error).";
export const packages = ['solid-js', '@solidjs/web'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { Errored, createComponent } from "solid-js";
     import { renderToString } from "@solidjs/web";
     function Boom() { throw new Error("boom"); }
     const contexts = [];
     renderToString(() => createComponent(Errored, {
       fallback: () => "fallback",
       get children() { return createComponent(Boom, {}); },
     }), { onError: (error, context) => { contexts.push(context ?? null); } });
     console.log(JSON.stringify({ contexts }));`,
  );
  const handled = r.contexts.some((c) => c?.kind === 'render' && c?.handling === 'fallback');
  return { reproduces: handled, observed: `onError contexts: ${JSON.stringify(r.contexts)}` };
}
