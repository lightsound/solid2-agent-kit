export const claim =
  'Two official pages still give 30 as the `[WIDE_SCOPE_DEPS]` threshold: the performance guide (guides/performance: "tracks 30 or more sources") and the attribution reference (`wideDeps`, "default 30"). Since @solidjs/signals 2.0.0-rc.14 the default `wideDeps` is 200, and a list\'s insert pass is exempt from the check.';
export const packages = ['@solidjs/signals'];

const BASE = 'https://v2-rebuild--solid-docs-v2.netlify.app';
const PAGES = {
  performance: `${BASE}/guides/performance.md`,
  reference: `${BASE}/reference/solid-js/advanced/diagnostics-dev-hooks/attribution.md`,
};

export async function probe(h) {
  const text = {};
  for (const [key, url] of Object.entries(PAGES)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET ${url}: ${response.status}`);
    text[key] = await response.text();
  }
  const guideSays30 = /tracks 30 or more sources \(`WIDE_SCOPE_DEPS`\)/.test(text.performance);
  const referenceSays30 = /reaches this \(default 30\)/.test(text.reference);
  const engine200 = /wideDeps: 200,/.test(h.read('@solidjs/signals', 'dist/dev.attribution.js'));
  return {
    reproduces: (guideSays30 || referenceSays30) && engine200,
    observed: `performance guide says 30: ${guideSays30}; attribution reference says default 30: ${referenceSays30}; engine default wideDeps 200: ${engine200}`,
  };
}
