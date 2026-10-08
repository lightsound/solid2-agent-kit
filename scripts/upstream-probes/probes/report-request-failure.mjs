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
     import * as server from "@solidjs/web";
     console.log(JSON.stringify({ exported: typeof server.reportRequestFailure }));
     process.exit(0);`,
  );
  const exported = r.exported === 'function';
  return {
    reproduces: fnTyped && kindTyped && exported,
    observed: `reportRequestFailure ${exported ? 'exported' : 'absent'} from @solidjs/web/server (typed ${fnTyped ? 'yes' : 'no'}); ServerErrorSite.kind includes "request": ${kindTyped}`,
  };
}
