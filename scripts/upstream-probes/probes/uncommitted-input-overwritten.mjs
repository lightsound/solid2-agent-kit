export const claim =
  'A `value` / `checked` binding bound to a committed value re-applies it when its template effect re-runs — another binding in the same template changed, or the source fired an equal value — and overwrites text the user typed but never committed; the dev build reports `[UNCOMMITTED_INPUT_OVERWRITTEN]` (the dev compile routes the binding through `setStatefulProperty`), production writes silently.';
export const packages = ['@solidjs/web', '@solidjs/compiler'];

export async function probe(h) {
  const compiled = h.nodeJson(
    `import { transform } from "@solidjs/compiler";
     const code = 'const A = (p) => <input value={p.v()} class={p.c()} />;';
     const dev = transform(code, { generate: "dom", filename: "a.jsx", moduleName: "@solidjs/web", dev: true }).code;
     const prod = transform(code, { generate: "dom", filename: "a.jsx", moduleName: "@solidjs/web" }).code;
     console.log(JSON.stringify({ devStateful: /setStatefulProperty\\(_el\\$, "value"/.test(dev), prodPlain: /_el\\$\\.value = /.test(prod) && !/setStatefulProperty/.test(prod) }));`,
  );
  const r = h.nodeJson(
    `import { Window } from "happy-dom";
     const w = new Window();
     for (const k of ["window", "document", "HTMLElement", "Node", "Element", "Event"]) globalThis[k] = w[k];
     const warnings = [];
     console.warn = (...args) => warnings.push(args.map(String).join(" "));
     const { createRoot, createSignal, flush } = await import("solid-js");
     const { effect, setStatefulProperty, className } = await import("@solidjs/web");
     const [v] = createSignal("saved");
     const [c, setC] = createSignal("a");
     let el;
     createRoot(() => {
       el = document.createElement("input");
       // The shape the dev compile emits for <input value={v()} class={c()} />: one effect per template.
       effect(() => ({ e: v(), t: c() }), ({ e, t }) => { setStatefulProperty(el, "value", e ?? ""); className(el, t); }, { name: "input.value, input.class" });
     });
     flush();
     el.value = "typed by the user";
     el.dispatchEvent(new w.Event("input"));
     setC("b");
     flush();
     const codes = warnings.filter((x) => x.includes("[UNCOMMITTED_INPUT_OVERWRITTEN]"));
     console.log(JSON.stringify({ value: el.value, codes: codes.length, first: codes[0]?.slice(0, 120) ?? null }));`,
    { conditions: ['browser', 'development'] },
  );
  const devCode = /code: "UNCOMMITTED_INPUT_OVERWRITTEN"/.test(h.read('@solidjs/web', 'dist/web.dev.js'));
  return {
    reproduces: compiled.devStateful && compiled.prodPlain && devCode && r.value === 'saved' && r.codes === 1,
    observed: `dev compile uses setStatefulProperty: ${compiled.devStateful}; prod compile assigns .value directly: ${compiled.prodPlain}; UNCOMMITTED_INPUT_OVERWRITTEN in the dev build: ${devCode}; after a sibling binding changed the typed text became ${JSON.stringify(r.value)} with ${r.codes} warning(s) (${r.first ?? 'none'})`,
  };
}
