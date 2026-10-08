export const claim =
  'Only `on` + uppercase (`onClick`) binds an event: a lowercase `onclick` / `onmouseover` attribute compiles to a plain attribute — the dev build warns `LOWERCASE_EVENT_ATTRIBUTE` — and a leftover 1.x `on:click` is a plain namespaced attribute, so neither receives the handler.';
export const packages = ['@solidjs/web'];

export async function probe(h) {
  const dev = h.read('@solidjs/web', 'dist/web.dev.js');
  const checkPresent = /code: "LOWERCASE_EVENT_ATTRIBUTE"/.test(dev);
  const firedOnAttribute = /typeof value === "function" && name\.startsWith\("on"\)/.test(dev);
  return {
    reproduces: checkPresent && firedOnAttribute,
    observed: `LOWERCASE_EVENT_ATTRIBUTE diagnostic ${checkPresent ? 'present' : 'absent'} in the dev build; attribute path fires it on a function-valued lowercase on* name: ${firedOnAttribute}`,
  };
}
