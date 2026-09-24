export const claim =
  'solid-js/attribution exposes why/formatRerun/costs/feedback/subscriptions as named exports, not as methods of `attribution`.';
export const packages = ['solid-js'];

const NAMED = ['why', 'formatRerun', 'costs', 'feedback', 'subscriptions'];

export async function probe(h) {
  const r = h.nodeJson(
    `import * as mod from "solid-js/attribution";
     const names = ${JSON.stringify(NAMED)};
     console.log(JSON.stringify({
       missing: names.filter((n) => typeof mod[n] !== "function"),
       methods: names.concat("format").filter((n) => mod.attribution && n in mod.attribution),
     }));`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces: r.missing.length === 0 && r.methods.length === 0,
    observed: `missing named exports: ${r.missing.join(', ') || 'none'}; methods on attribution: ${r.methods.join(', ') || 'none'}`,
  };
}
