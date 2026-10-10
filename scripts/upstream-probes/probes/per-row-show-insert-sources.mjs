export const claim =
  'A `<Show>` that narrows each row of a `<For>` makes every row a source of the list\'s insert effect (one per row), while plain element and component rows cost it none. No `[WIDE_SCOPE_DEPS]` reports it: that pass is exempt by construction, and the default `wideDeps` is 200. Only the always-on `[HUGE_FAN_IN]` does, from 2000 sources. The HMR wrapper memos from `solid-js/refresh` are plumbing and are not counted as sources either.';
export const packages = ['solid-js', '@solidjs/web', '@solidjs/signals', '@solidjs/diagnostics'];

const ROWS = 2100;

export async function probe(h) {
  const r = h.nodeJson(
    `import { Window } from "happy-dom";
     const w = new Window();
     for (const k of ["document", "Node", "Element", "HTMLElement", "Text", "DocumentFragment", "Comment", "Event"]) globalThis[k] = w[k];
     globalThis.window = w;
     const { createComponent, createMemo, createRoot, createSignal, flush, For, Show } = await import("solid-js");
     const { insert, render } = await import("@solidjs/web");
     const { captureArtifact } = await import("@solidjs/diagnostics");
     const items = Array.from({ length: ${ROWS} }, (_, i) => ({ key: "k" + i, name: "n" + i }));
     const [all] = createSignal(items);
     let byKey;
     function Row(props) { const el = document.createElement("div"); insert(el, () => props.name); return el; }
     const rows = {
       element: (item) => { const el = document.createElement("div"); insert(el, () => item().name); return el; },
       component: (item) => createComponent(Row, { get name() { return item().name; } }),
       show: (item) => createComponent(Show, {
         get when() { return byKey().get(item().key); },
         children: (m) => createComponent(Row, { get name() { return m().name; } }),
       }),
     };
     const out = {};
     for (const [name, row] of Object.entries(rows)) {
       const host = document.createElement("div");
       document.body.append(host);
       let dispose;
       const { artifact } = await captureArtifact(() => {
         byKey = createRoot(() => createMemo(() => new Map(all().map((i) => [i.key, i]))));
         dispose = render(() => createComponent(For, { get each() { return all(); }, keyed: (i) => i.key, children: row }), host);
         flush();
       }, { scenario: name, attribution: { log: false, hotTime: false } });
       const fanIn = artifact.diagnostics.find((d) => d.code === "HUGE_FAN_IN");
       out[name] = {
         rows: host.children.length,
         fanIn: fanIn ? Number(/tracked (\\d+) sources/.exec(fanIn.message)?.[1]) : 0,
         wide: artifact.diagnostics.filter((d) => d.code === "WIDE_SCOPE_DEPS").length,
       };
       dispose(); host.remove();
     }
     console.log(JSON.stringify(out));
     process.exit(0);`,
    { conditions: ['browser', 'development'] },
  );
  const web = h.read('@solidjs/web', 'dist/web.dev.js');
  const signals = h.read('@solidjs/signals', 'dist/dev.attribution.js');
  const refresh = h.read('solid-js', 'dist/refresh.dev.js');
  const insertExempt = /_wide: true/.test(web);
  const defaultWide = /wideDeps: 200,/.test(signals);
  const refreshPlumbing = /_plumbing: true/.test(refresh);
  const perRow =
    r.show.rows === ROWS && r.show.fanIn >= ROWS && r.show.wide === 0 &&
    r.element.fanIn === 0 && r.component.fanIn === 0;
  return {
    reproduces: perRow && insertExempt && defaultWide && refreshPlumbing,
    observed: `${ROWS} rows: <Show> rows HUGE_FAN_IN ${r.show.fanIn} sources (WIDE_SCOPE_DEPS ${r.show.wide}); element rows ${r.element.fanIn}; component rows ${r.component.fanIn}; insert pass marked _wide: ${insertExempt}; default wideDeps 200: ${defaultWide}; solid-js/refresh wrappers marked _plumbing: ${refreshPlumbing}`,
  };
}
