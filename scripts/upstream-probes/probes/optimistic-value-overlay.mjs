export const claim =
  'The value form createOptimisticStore([]) is a pure overlay: rows an action writes show while it is in flight and vanish once it settles (the reference docs example does this).';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { action, createOptimisticStore, flush } from "solid-js";
     const [todos, setTodos] = createOptimisticStore([]);
     let release;
     const gate = new Promise((resolve) => (release = resolve));
     const save = action(function* (title) {
       setTodos((draft) => { draft.push({ title }); });
       yield gate;
       setTodos((draft) => { draft[0].saved = true; });
     });
     const done = save("a");
     flush();
     const inFlight = todos.length;
     release();
     await done;
     flush();
     await new Promise((resolve) => setTimeout(resolve, 0));
     flush();
     console.log(JSON.stringify({ inFlight, settled: todos.length }));`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces: r.inFlight === 1 && r.settled === 0,
    observed: `rows in flight: ${r.inFlight}; rows after settle: ${r.settled}`,
  };
}
