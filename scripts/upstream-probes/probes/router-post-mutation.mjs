export const claim =
  "Single flight is the router's: a mounted router treats every POST server-function call as a mutation (no `revalidate` keys → the server re-collects the current page's data and the client revalidates every query); reads are exempt through `query()` or `GET(fn)`, a non-mutating POST returns `respond(value, { revalidate: \"\" })`, and `createRouter({ routes, singleFlight: false })` opts out.";
export const packages = ['@solidjs/router'];

export async function probe(h) {
  const readme = h.read('@solidjs/router', 'README.md');
  const factory = h.read('@solidjs/router', 'dist/routers/factory.d.ts');
  const documented =
    /Every POST server function call is treated as a mutation\./.test(readme) &&
    /Reads are exempt when they go through `query\(\)`, which switches a server function to `GET` automatically, or when the function is declared with `GET\(fn\)`/.test(readme) &&
    /`respond\(value, \{ revalidate: "" \}\)`/.test(readme);
  const optOut = /singleFlight\?: boolean;/.test(factory);
  const { codes } = h.typecheck(
    `import { createRouter } from "@solidjs/router";
     const Router = createRouter({ routes: [], singleFlight: false });
     void Router;`,
  );
  return {
    reproduces: documented && optOut && codes.length === 0,
    observed: `README states the POST-is-mutation default, the query()/GET() exemption and respond(value, { revalidate: "" }): ${documented}; singleFlight?: boolean in the createRouter config: ${optOut}; createRouter({ singleFlight: false }) type errors: ${codes.join(',') || 'none'}`,
  };
}
