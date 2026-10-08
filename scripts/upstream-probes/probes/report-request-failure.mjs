export const claim =
  '`reportRequestFailure(error, event)` is exported from `@solidjs/web` (server) and reports failures outside render and server functions — middleware, request setup — to the ambient server error hook as `kind: "request"`, which `ServerErrorSite.kind` now includes; a synchronous throw out of `renderToString` / `renderToStream`\'s first pass is reported to the hook as `kind: "render", handling: "failed"` before rethrow.';
export const packages = ['@solidjs/web', 'solid-js'];

export async function probe(h) {
  const serverTypes = h.read('@solidjs/web', 'types/server.d.ts');
  const siteTypes = h.read('solid-js', 'types/index.d.ts');
  const fnTyped = /export declare function reportRequestFailure\(error: unknown, event: RequestEvent\): void/.test(serverTypes);
  const kindTyped = /kind: "render" \| "server-function" \| "request"/.test(siteTypes);
  const r = h.nodeJson(
    `// The bare import under Node resolves to the server build (the "node"
     // condition on "."); the client export is checked in the types above.
     import { configureServerErrors, createComponent, renderToString, reportRequestFailure } from "@solidjs/web";
     const heard = [];
     configureServerErrors({ onError: (error, site) => { heard.push({ message: error?.message, kind: site?.kind, handling: site?.handling }); } });
     let rethrown = false;
     try {
       renderToString(() => createComponent(() => { throw new Error("render"); }, {}));
     } catch (e) {
       rethrown = e?.message === "render";
     }
     const heardBeforeCatch = heard.length;
     if (typeof reportRequestFailure === "function") reportRequestFailure(new Error("middleware"), { request: new Request("http://localhost/") });
     console.log(JSON.stringify({ exported: typeof reportRequestFailure, heard, heardBeforeCatch, rethrown }));
     process.exit(0);`,
  );
  const exported = r.exported === 'function';
  const render = r.heard.find((e) => e.message === 'render');
  const request = r.heard.find((e) => e.message === 'middleware');
  const renderFailed = r.rethrown && r.heardBeforeCatch === 1 && render?.kind === 'render' && render?.handling === 'failed';
  const requestFailed = request?.kind === 'request' && request?.handling === 'failed';
  return {
    reproduces: fnTyped && kindTyped && exported && renderFailed && requestFailed,
    observed: `reportRequestFailure ${exported ? 'exported' : 'absent'} from the server build (typed ${fnTyped ? 'yes' : 'no'}); ServerErrorSite.kind includes "request": ${kindTyped}; renderToString sync throw heard as ${render ? `${render.kind}/${render.handling}` : 'nothing'} (rethrown: ${r.rethrown}); reportRequestFailure heard as ${request ? `${request.kind}/${request.handling}` : 'nothing'}`,
  };
}
