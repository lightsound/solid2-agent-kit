export const claim = '<Dynamic> is @deprecated in the types, still exported by @solidjs/web, with no runtime warning.';
export const packages = ['@solidjs/web'];

export async function probe(h) {
  const { tags } = h.typecheck('import { Dynamic, dynamic } from "@solidjs/web";\nvoid Dynamic; void dynamic;\n');
  const deprecated = tags.Dynamic?.includes('deprecated') ?? false;
  const r = h.nodeJson(
    `import { createComponent, createRoot, flush } from "solid-js";
     import * as web from "@solidjs/web";
     const logged = [];
     for (const level of ["warn", "error", "info", "log"]) console[level] = (...args) => logged.push(level + ": " + args.map(String).join(" ").slice(0, 120));
     let rendered = null;
     if (typeof web.Dynamic === "function") {
       let view;
       createRoot(() => { view = createComponent(web.Dynamic, { component: (p) => "tag:" + p.x, x: 1 }); });
       flush();
       rendered = String(typeof view === "function" ? view() : view);
     }
     process.stdout.write(JSON.stringify({ exported: typeof web.Dynamic === "function", rendered, logged }) + "\\n");`,
    { conditions: ['browser', 'development'] },
  );
  const renders = r.rendered === 'tag:1';
  return {
    reproduces: deprecated && r.exported && renders && r.logged.length === 0,
    observed: `@deprecated tag ${deprecated ? 'present' : 'absent'}; runtime export ${r.exported ? 'present' : 'absent'}; dev-build render ${renders ? 'works' : `gave ${JSON.stringify(r.rendered)}`}; console ${r.logged.length ? `logged ${JSON.stringify(r.logged)}` : 'silent'}`,
  };
}
