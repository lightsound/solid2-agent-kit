export const claim = "@solidjs/testing-library's render(…, { location }) option is typed but not implemented.";
export const packages = ['@solidjs/testing-library'];

export async function probe(h) {
  const typed = /\blocation\?\s*:/.test(h.read('@solidjs/testing-library', 'dist/index.d.ts'));
  const implemented = /\blocation\b/.test(h.read('@solidjs/testing-library', 'dist/index.js'));
  return {
    reproduces: typed && !implemented,
    observed: `options.location ${typed ? 'typed' : 'not typed'}, ${implemented ? 'referenced' : 'never read'} in dist/index.js`,
  };
}
