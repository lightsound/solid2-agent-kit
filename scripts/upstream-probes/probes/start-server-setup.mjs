export const claim =
  'In @solidjs/vite-plugin at the baseline, the start option that runs a server-only module before the server graph is `start.serverSetup` — the rc.19-era name `start.instrument` was renamed, and the plugin throws "`start.instrument` has been renamed to `start.serverSetup`" when the old key is used. The sibling options `start.serverRenderSetup` (per-request app preparation before SSR) and `start.clientSetup` (client module run before hydrate/render) are declared alongside it, and the plugin still ships its node entry (`node-entry` types, `node-runtime.js`).';
export const packages = ['@solidjs/vite-plugin'];

export async function probe(h) {
  const types = await h.read('@solidjs/vite-plugin', 'dist/types/src/ssr/index.d.ts');
  const esm = await h.read('@solidjs/vite-plugin', 'dist/esm/index.mjs');
  const nodeEntryTypes = await h.read('@solidjs/vite-plugin', 'dist/types/src/node-entry/index.d.ts');
  const checks = {
    serverSetupDeclared: /serverSetup\?: string/.test(types),
    serverRenderSetupDeclared: /serverRenderSetup\?: string/.test(types),
    clientSetupDeclared: /clientSetup\?: string/.test(types),
    instrumentOptionGone: !/instrument\?: string/.test(types),
    renameThrowPresent: esm.includes('has been renamed to `start.serverSetup`'),
    nodeRuntimeStillShips: esm.includes('node-runtime.js') && nodeEntryTypes.length > 0,
  };
  return {
    reproduces: Object.values(checks).every(Boolean),
    observed: JSON.stringify(checks),
  };
}
