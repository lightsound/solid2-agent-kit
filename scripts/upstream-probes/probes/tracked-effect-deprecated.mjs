export const claim = 'createTrackedEffect is still exported from solid-js and @deprecated in the types.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const { tags } = h.typecheck('import { createTrackedEffect } from "solid-js";\nvoid createTrackedEffect;\n');
  const deprecated = tags.createTrackedEffect?.includes('deprecated') ?? false;
  const { exported } = h.nodeJson(
    'import * as solid from "solid-js";\nconsole.log(JSON.stringify({ exported: typeof solid.createTrackedEffect === "function" }));\n',
    { conditions: ['browser'] },
  );
  return {
    reproduces: deprecated && exported,
    observed: `@deprecated tag ${deprecated ? 'present' : 'absent'}; runtime export ${exported ? 'present' : 'absent'}`,
  };
}
