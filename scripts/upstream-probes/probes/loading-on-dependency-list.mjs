export const claim =
  '`<Loading on>` is a tracked dependency list, not a compared key: a change to anything the expression reads re-arms the boundary (the fallback shows while new content is pending) even when the expression evaluates to the same value.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { Loading, createComponent, createMemo, createRoot, createSignal, flush } from "solid-js";
     const resolvers = {};
     const [id, setId] = createSignal(1);
     let view;
     createRoot(() => {
       const data = createMemo(() => { const key = id(); return new Promise((resolve) => { resolvers[key] = resolve; }); });
       view = createComponent(Loading, {
         // Reads id() but always evaluates to 0: a key compare keeps the content, a dependency list re-arms.
         get on() { id(); return 0; },
         fallback: "fallback",
         get children() { return data(); },
       });
     });
     const read = () => { let v = view; while (typeof v === "function") v = v(); return Array.isArray(v) ? v.map(String).join("") : String(v); };
     const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
     flush();
     const first = read();
     resolvers[1]("one"); await tick(); flush(); await tick(); flush();
     const settled = read();
     setId(2); flush(); await tick(); flush();
     const rearmed = read();
     resolvers[2]("two"); await tick(); flush(); await tick(); flush();
     const landed = read();
     console.log(JSON.stringify({ first, settled, rearmed, landed }));
     process.exit(0);`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces: r.first === 'fallback' && r.settled === 'one' && r.rearmed === 'fallback' && r.landed === 'two',
    observed: `first flight: ${r.first}; settled: ${r.settled}; after a read of \`on\` changed with an equal value: ${r.rearmed}; landed: ${r.landed}`,
  };
}
