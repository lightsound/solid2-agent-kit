export const claim =
  'solid-js exports no JSX namespace (import type { JSX } from "solid-js" is TS2305); JSX comes from @solidjs/web — the docs list it as a solid-js export.';
export const packages = ['solid-js', '@solidjs/web'];

export async function probe(h) {
  const fromSolid = h.typecheck('import type { JSX } from "solid-js";\nexport type E = JSX.Element;\n');
  const fromWeb = h.typecheck('import type { JSX } from "@solidjs/web";\nexport type E = JSX.Element;\n');
  const missing = fromSolid.codes.includes(2305);
  return {
    reproduces: missing && fromWeb.codes.length === 0,
    observed: `solid-js: ${missing ? 'TS2305' : `diagnostics [${fromSolid.codes.join(', ')}]`}; @solidjs/web: ${fromWeb.codes.length ? `diagnostics [${fromWeb.codes.join(', ')}]` : 'type-checks'}`,
  };
}
