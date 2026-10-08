export const claim =
  'The official `createSignal` reference (reference/solid-js/reactivity/create-signal) still says that within the frame a write to a writable memo wins over a same-tick recompute — the rc.13 behavior; since rc.14 a source change in the same update re-runs the function with the write as `prev`.';
export const packages = ['solid-js'];

const PAGE = 'https://v2-rebuild--solid-docs-v2.netlify.app/reference/solid-js/reactivity/create-signal.md';

export async function probe() {
  const response = await fetch(PAGE);
  if (!response.ok) throw new Error(`GET ${PAGE}: ${response.status}`);
  const page = await response.text();
  const stale = page.includes('the write wins over a same-tick recompute');
  return {
    reproduces: stale,
    observed: `create-signal reference says "the write wins over a same-tick recompute": ${stale}`,
  };
}
