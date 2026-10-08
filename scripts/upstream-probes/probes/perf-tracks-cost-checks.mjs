export const claim =
  '`enablePerformanceTracks()` no longer runs the six attribution cost checks (`hotRuns`, `hotTime`, `wideDeps`, `unstableMemos`, `fanOut`, `wastedRecompute`) by default — they are opt-in via `enablePerformanceTracks({ attribution: { checks: true } })` / the vite plugin\'s `performanceTracks: { attribution: { checks: true } }`, or by taking an `attribution.enable()` hold yourself.';
export const packages = ['@solidjs/web'];

export async function probe(h) {
  const types = h.read('@solidjs/web', 'performance-tracks/types/index.d.ts');
  const attributionOption = /attribution\?: AttributionOptions/.test(types);
  const checksOptIn = /checks: true/.test(types) && /quiets the console and the cost checks/.test(types);
  const hotRuns = /hotRuns/.test(types);
  return {
    reproduces: attributionOption && checksOptIn && hotRuns,
    observed: `attribution option ${attributionOption ? 'typed' : 'absent'}; "checks: true" opt-in documented ${checksOptIn ? 'yes' : 'no'}; cost-check names ${hotRuns ? 'mentioned' : 'absent'} in performance-tracks types`,
  };
}
