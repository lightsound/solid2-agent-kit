export const claim =
  '`live(fn)` implies `GET`: a server function not already declared `GET` is wrapped at runtime on both the client and the server side, so `live(fn)` and `live(GET(fn))` are the same declaration (the types say so too); `broadcast()` is the experimental shared-answer form of the same.';
export const packages = ['@solidjs/web'];

export async function probe(h) {
  const client = h.read('@solidjs/web', 'server-functions/dist/client.js');
  const server = h.read('@solidjs/web', 'server-functions/dist/server.js');
  const clientTypes = h.read('@solidjs/web', 'types/server-functions/client.d.ts');
  const serverTypes = h.read('@solidjs/web', 'types/server-functions/server.d.ts');
  const clientWraps = /getServerFunctionMetadata\(fn\)\?\.method !== "GET"\) fn = rpc\.GET\(fn\)/.test(client);
  const serverWraps = /getServerFunctionMetadata\(fn\)\?\.method !== "GET"\) fn = GET\(fn\)/.test(server);
  const documented = /Implies `GET` \(a live source is a read\); an explicit\s*\*\s*`live\(GET\(fn\)\)` is equivalent/.test(clientTypes);
  const broadcast = /export declare function broadcast</.test(clientTypes) && /export declare function broadcast</.test(serverTypes) && /@experimental/.test(serverTypes);
  return {
    reproduces: clientWraps && serverWraps && documented && broadcast,
    observed: `live() wraps a non-GET function in GET: client ${clientWraps}, server ${serverWraps}; types document the implication: ${documented}; broadcast() exported (experimental): ${broadcast}`,
  };
}
