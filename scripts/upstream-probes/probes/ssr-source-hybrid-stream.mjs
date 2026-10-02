export const claim =
  'ssrSource: "hybrid" continues an async-iterable source on the client after adopting the serialized value and is identical to "server" for a sync or promise compute (no re-run).';
export const packages = ['solid-js'];

export async function probe(h) {
  const types = h.read('solid-js', 'types/client/hydration.d.ts');
  const identical = /"hybrid"` is identical to `"server"`/.test(types);
  const stream = /returns an \*\*async iterable\*\*/.test(types);
  const rerun = /re-runs the compute to take over/.test(types);
  return {
    reproduces: identical && stream && !rerun,
    observed: `hydration.d.ts: hybrid ${identical ? 'is' : 'is not'} documented as identical to "server" for non-iterable computes; async-iterable continuation ${stream ? 'documented' : 'absent'}; rc.9 "re-runs the compute to take over" wording ${rerun ? 'present' : 'absent'}`,
  };
}
