export const claim =
  "renderToString's onError hears handled failures too (a context with handling: \"fallback\" for an <Errored>-contained error); the rc.8 one-argument form keeps working.";
export const packages = ['solid-js', '@solidjs/web'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { Errored, createComponent } from "solid-js";
     import { renderToString } from "@solidjs/web";
     function Boom() { throw new Error("boom"); }
     const app = () => createComponent(Errored, {
       fallback: () => "fallback",
       get children() { return createComponent(Boom, {}); },
     });
     const contexts = [];
     renderToString(app, { onError: (error, context) => { contexts.push(context ?? null); } });
     let oneArgument = 0;
     renderToString(app, { onError: (error) => { oneArgument++; } });
     console.log(JSON.stringify({ contexts, oneArgument }));`,
  );
  const handled = r.contexts.some((c) => c?.kind === 'render' && c?.handling === 'fallback');
  return {
    reproduces: handled && r.oneArgument > 0,
    observed: `onError contexts: ${JSON.stringify(r.contexts)}; one-argument onError called ${r.oneArgument} time(s)`,
  };
}
