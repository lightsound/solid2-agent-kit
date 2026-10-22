export const claim = "@solidjs/testing-library's render(…, { location }) option is typed but not implemented.";
export const packages = ['@solidjs/testing-library'];

export async function probe(h) {
  const typed = /\blocation\?\s*:/.test(h.read('@solidjs/testing-library', 'dist/types.d.ts'));
  // Code only: the option's doc comment names it, which is not an implementation.
  const code = h
    .read('@solidjs/testing-library', 'dist/index.js')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const implemented = /\blocation\b/.test(code);
  return {
    reproduces: typed && !implemented,
    observed: `options.location ${typed ? 'typed' : 'not typed'} in dist/types.d.ts, ${implemented ? 'referenced' : 'never read'} by the code of dist/index.js`,
  };
}
