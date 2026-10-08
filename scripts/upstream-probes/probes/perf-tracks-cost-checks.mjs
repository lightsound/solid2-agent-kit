export const claim =
  '`enablePerformanceTracks()` no longer runs the six attribution cost checks (`hotRuns`, `hotTime`, `wideDeps`, `unstableMemos`, `fanOut`, `wastedRecompute`) by default — they are opt-in via `enablePerformanceTracks({ attribution: { checks: true } })` / the vite plugin\'s `performanceTracks: { attribution: { checks: true } }` (passed through unchanged), or by taking an `attribution.enable()` hold yourself (the engine default is checks on).';
export const packages = ['@solidjs/web', '@solidjs/vite-plugin', '@solidjs/signals'];

export async function probe(h) {
  const types = h.read('@solidjs/web', 'performance-tracks/types/index.d.ts');
  const tracks = h.read('@solidjs/web', 'performance-tracks/dist/performance-tracks.dev.js');
  const plugin = h.read('@solidjs/vite-plugin', 'dist/cjs/index.cjs');
  const engine = h.read('@solidjs/signals', 'dist/types/core/attribution.d.ts');
  const attributionOption = /attribution\?: AttributionOptions/.test(types);
  const offByDefault = /checks: options\.attribution\?\.checks \?\? false/.test(tracks);
  const passedThrough = /function resolvePerformanceTracksOptions\(option\) \{\s*if \(option === false\) return null;\s*if \(option === true \|\| option === undefined\) return \{\};\s*return option;\s*\}/.test(plugin);
  const engineDefaultOn = /`fanOut`, `wastedRecompute` \(default true\)/.test(engine);
  return {
    reproduces: attributionOption && offByDefault && passedThrough && engineDefaultOn,
    observed: `attribution option ${attributionOption ? 'typed' : 'absent'}; tracks hold defaults checks to ${offByDefault ? 'false' : 'something else'}; plugin passes an options object through: ${passedThrough}; attribution.enable() default checks: ${engineDefaultOn ? 'true' : 'not documented as true'}`,
  };
}
