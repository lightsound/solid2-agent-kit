export const claim = '<Dynamic> is @deprecated in the types, still exported by @solidjs/web, with no runtime warning.';
export const packages = ['@solidjs/web'];

export async function probe(h) {
  const { tags } = h.typecheck('import { Dynamic, dynamic } from "@solidjs/web";\nvoid Dynamic; void dynamic;\n');
  const deprecated = tags.Dynamic?.includes('deprecated') ?? false;
  const { exported } = h.nodeJson(
    'import * as web from "@solidjs/web";\nconsole.log(JSON.stringify({ exported: typeof web.Dynamic === "function" }));\n',
    { conditions: ['browser', 'development'] },
  );
  const warns = /deprecat/i.test(h.read('@solidjs/web', 'dist/web.dev.js'));
  return {
    reproduces: deprecated && exported && !warns,
    observed: `@deprecated tag ${deprecated ? 'present' : 'absent'}; runtime export ${exported ? 'present' : 'absent'}; dev build ${warns ? 'mentions deprecation' : 'has no deprecation warning'}`,
  };
}
