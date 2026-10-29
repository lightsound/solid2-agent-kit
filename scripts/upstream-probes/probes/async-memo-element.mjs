export const claim =
  'Since 2.0.0-rc.19, on the server an async memo (or async iterable source) whose value is rendered output — JSX, a component result, a `<Loading>`/`<Errored>` boundary — cannot reach the hydration serializer: the memo rejects with `ASYNC_MEMO_ELEMENT` and the nearest `<Errored>` contains it like any render error. Return data from the async memo and render the JSX from it; ordinary data is never refused.';
export const packages = ['solid-js', '@solidjs/web'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { createMemo, Errored, Loading, createComponent } from "solid-js";
     import { renderToStream } from "@solidjs/web";
     function Inner() {
       const el = createMemo(async () => {
         await new Promise((res) => setTimeout(res, 1));
         return createComponent(Loading, { fallback: "inner-fallback", get children() { return "inner"; } });
       });
       return createComponent(Loading, { fallback: "outer-loading", get children() { return el(); } });
     }
     const stream = renderToStream(() => createComponent(Errored, {
       fallback: (err) => "[caught]",
       get children() { return createComponent(Inner, {}); },
     }));
     const html = await new Response(stream.readable).text();
     console.log(JSON.stringify({ caught: html.includes("[caught]") }));
     process.exit(0);`,
    { conditions: ['development'] },
  );
  const coded = r.stderr.includes('[ASYNC_MEMO_ELEMENT]');
  return {
    reproduces: r.caught === true && coded,
    observed: `nearest <Errored> rendered its fallback: ${r.caught}; [ASYNC_MEMO_ELEMENT] ${coded ? 'reported' : 'not reported'}`,
  };
}
