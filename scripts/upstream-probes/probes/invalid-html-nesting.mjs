export const claim =
  'Since 2.0.0, hydrating markup whose nesting is invalid HTML across a component boundary \u2014 a `<div>` inside a `<p>` \u2014 warns `[INVALID_HTML_NESTING]` in the dev build: the browser parser moved the element out of its parent in the server HTML, hydration keeps the parser\u2019s tree, and the message names the parent, the child, and where the parser put it.';
export const packages = ['solid-js', '@solidjs/web', '@solidjs/compiler'];

const SOURCE = `
function P(props) { return <p>{props.children}</p>; }
export default function App() { return <P><div>block</div></P>; }
`;

export async function probe(h) {
  const server = h.nodeJson(
    `import { transform } from "@solidjs/compiler";
     import { writeFileSync } from "node:fs";
     const out = transform(${JSON.stringify(SOURCE)}, { generate: "ssr", hydratable: true, filename: "app.jsx", moduleName: "@solidjs/web", dev: true });
     writeFileSync(new URL("./app-ssr.mjs", import.meta.url), out.code);
     const { default: App } = await import("./app-ssr.mjs");
     const { renderToString, createComponent } = await import("@solidjs/web");
     console.log(JSON.stringify({ html: renderToString(() => createComponent(App, {})) }));`,
    { conditions: ['development'] },
  );
  const client = h.nodeJson(
    `import { Window } from "happy-dom";
     const w = new Window();
     for (const k of ["window", "document", "HTMLElement", "Node", "Element", "Event", "MutationObserver", "getComputedStyle"]) {
       if (w[k] !== undefined) globalThis[k] = w[k];
     }
     // The state the server page's hydration script installs (generateHydrationScript).
     globalThis._$HY = { events: [], completed: new WeakSet(), r: {}, fe() {} };
     const warnings = [];
     console.warn = (...args) => warnings.push(args.map(String).join(" "));
     const mount = w.document.createElement("div");
     mount.innerHTML = ${JSON.stringify(server.html)};
     w.document.body.appendChild(mount);
     const parsed = mount.innerHTML;
     const { transform } = await import("@solidjs/compiler");
     const { writeFileSync } = await import("node:fs");
     const out = transform(${JSON.stringify(SOURCE)}, { generate: "dom", hydratable: true, filename: "app.jsx", moduleName: "@solidjs/web", dev: true });
     writeFileSync(new URL("./app-dom.mjs", import.meta.url), out.code);
     const { default: App } = await import("./app-dom.mjs");
     const { hydrate, createComponent } = await import("@solidjs/web");
     hydrate(() => createComponent(App, {}), mount);
     const nesting = warnings.filter((x) => x.includes("[INVALID_HTML_NESTING]"));
     console.log(JSON.stringify({ parsed, after: mount.innerHTML, warnings: nesting.length, text: nesting[0] ?? null }));`,
    { conditions: ['browser', 'development'] },
  );
  const moved = client.parsed.includes('</p><div');
  const kept = client.after.includes('</p><div');
  const named = client.text !== null && client.text.includes('<div>') && client.text.includes('<p>');
  return {
    reproduces: moved && client.warnings === 1 && kept && named,
    observed: `server HTML ${JSON.stringify(server.html)}; the DOM parser rebuilt it as ${JSON.stringify(client.parsed)}; hydration warned [INVALID_HTML_NESTING] ${client.warnings}x, naming the child and parent (${client.text ? client.text.slice(0, 160) : 'none'}); after hydration the tree is still the parser's: ${JSON.stringify(client.after)}`,
  };
}
