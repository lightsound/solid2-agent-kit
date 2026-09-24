export const claim =
  'The dev server render reports a boundary-routed render error as [SSR_RENDER_ERROR_CONTAINED] with an owner chain.';
export const packages = ['solid-js', '@solidjs/web'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { Errored, createComponent } from "solid-js";
     import { renderToString } from "@solidjs/web";
     function Boom() { throw new Error("boom"); }
     renderToString(() => createComponent(Errored, {
       fallback: () => "fallback",
       get children() { return createComponent(Boom, {}); },
     }));
     console.log(JSON.stringify({}));`,
    { conditions: ['development'] },
  );
  const coded = r.stderr.includes('[SSR_RENDER_ERROR_CONTAINED]');
  const chain = /in <Errored> › <Boom>/.test(r.stderr);
  return {
    reproduces: coded && chain,
    observed: `[SSR_RENDER_ERROR_CONTAINED] ${coded ? 'reported' : 'not reported'}; owner chain ${chain ? 'present' : 'absent'}`,
  };
}
