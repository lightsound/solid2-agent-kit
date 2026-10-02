export const claim =
  "@solidjs/vite-plugin's `solid.sourceNames` option replaced the compiler's `componentNames` (the old name is gone from the plugin's types).";
export const packages = ['@solidjs/vite-plugin'];

export async function probe(h) {
  const types = h.read('@solidjs/vite-plugin', 'dist/types/src/index.d.ts');
  const sourceNames = /\bsourceNames\?:/.test(types);
  const componentNames = /\bcomponentNames\b/.test(types);
  return {
    reproduces: sourceNames && !componentNames,
    observed: `sourceNames option ${sourceNames ? 'typed' : 'absent'}; componentNames ${componentNames ? 'still mentioned' : 'absent'} in the plugin's types`,
  };
}
