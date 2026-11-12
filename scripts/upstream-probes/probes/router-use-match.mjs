export const claim =
  '`useMatch` is exported from @solidjs/router: it takes an accessor returning a path pattern and answers a memo of the match (params typed from the pattern) or nothing — testing a pattern against the current pathname without a route existing for it.';
export const packages = ['@solidjs/router'];

export async function probe(h) {
  const routing = await h.read('@solidjs/router', 'dist/routing.d.ts');
  const index = await h.read('@solidjs/router', 'dist/index.d.ts');
  const checks = {
    exportedFromIndex: /useMatch/.test(index),
    declaredInRouting: /export declare const useMatch: .*path: \(\) =>/.test(routing) && routing.includes('PathMatch') && routing.includes('| undefined'),
    docSaysMemoOfMatch: routing.includes('creates a `Memo` that returns match information'),
  };
  return {
    reproduces: Object.values(checks).every(Boolean),
    observed: JSON.stringify(checks),
  };
}
