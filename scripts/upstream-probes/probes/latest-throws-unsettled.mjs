export const claim =
  'latest(source) before the first value throws NotReadyError outside tracking scopes too (event handlers, imperative code) instead of returning undefined.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { createMemo, createRoot, latest, NotReadyError } from "solid-js";
     let user;
     createRoot(() => { user = createMemo(async () => { await new Promise((r) => setTimeout(r, 50)); return "Ada"; }); });
     let outcome;
     try { outcome = "returned " + JSON.stringify(latest(user)); }
     catch (e) { outcome = e instanceof NotReadyError ? "NotReadyError" : "threw " + String(e?.message ?? e); }
     console.log(JSON.stringify({ outcome }));
     process.exit(0);`,
    { conditions: ['browser', 'development'] },
  );
  return { reproduces: r.outcome === 'NotReadyError', observed: `latest() outside a tracking scope: ${r.outcome}` };
}
