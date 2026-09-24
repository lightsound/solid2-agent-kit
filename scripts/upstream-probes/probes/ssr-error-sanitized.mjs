export const claim =
  'A production server render sanitizes render errors: an <Errored> fallback printing err().message shows "Internal Server Error".';
export const packages = ['solid-js', '@solidjs/web'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { Errored, createComponent } from "solid-js";
     import { renderToString } from "@solidjs/web";
     function Boom() { throw new Error("secret-detail"); }
     const html = renderToString(() => createComponent(Errored, {
       fallback: (err) => "[" + err().message + "]",
       get children() { return createComponent(Boom, {}); },
     }));
     console.log(JSON.stringify({ shown: html.match(/^\\[([^\\]]*)\\]/)?.[1] ?? null, leaks: html.includes("secret-detail") }));`,
  );
  return {
    reproduces: r.shown === 'Internal Server Error' && !r.leaks,
    observed: `fallback shows ${JSON.stringify(r.shown)}; original message ${r.leaks ? 'present' : 'absent'} in the HTML`,
  };
}
