export const claim =
  'attribution.history(type) is the one ring-buffer reader (the holds / waterfalls / navigations / interactions methods are gone) and attribution.subscribe is gone — live records arrive on OBSERVE.records.subscribe.';
export const packages = ['solid-js', '@solidjs/signals'];

const REMOVED = ['subscribe', 'holds', 'waterfalls', 'navigations', 'interactions'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { OBSERVE } from "solid-js";
     import { attribution } from "solid-js/attribution";
     console.log(JSON.stringify({
       history: typeof attribution?.history === "function",
       present: ${JSON.stringify(REMOVED)}.filter((name) => name in attribution),
       records: typeof OBSERVE?.records?.subscribe === "function",
     }));`,
    { conditions: ['browser', 'development'] },
  );
  return {
    reproduces: r.history && r.present.length === 0 && r.records,
    observed: `attribution.history ${r.history ? 'present' : 'absent'}; removed methods still present: ${r.present.join(', ') || 'none'}; OBSERVE.records.subscribe ${r.records ? 'present' : 'absent'}`,
  };
}
