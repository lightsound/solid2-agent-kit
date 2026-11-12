export const claim =
  'In the dev build, `refresh()` on anything that is not a Solid source accessor or a refreshable store throws `[INVALID_REFRESH_TARGET]` — a plain function included. The prod build silently accepts the same call, so the mistake only surfaces in dev.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { createSignal, flush, refresh } from "solid-js";
const attempt = (fn) => { try { fn(); return "ok"; } catch (e) { return String(e?.message ?? e).match(/^\\[([A-Z_]+)\\]/)?.[1] ?? "threw"; } };
const [s] = createSignal(1);
const out = { plainFn: attempt(() => refresh(() => 1)), number: attempt(() => refresh(42)), signal: attempt(() => refresh(s)) };
flush();
console.log(JSON.stringify(out));`;

export async function probe(h) {
  const dev = h.nodeJson(script, { conditions: ['browser', 'development'] });
  const prod = h.nodeJson(script, { conditions: ['browser'] });
  return {
    reproduces: dev.plainFn === 'INVALID_REFRESH_TARGET' && dev.number === 'INVALID_REFRESH_TARGET' && dev.signal === 'ok' && prod.plainFn === 'ok' && prod.signal === 'ok',
    observed: `dev: plain function ${dev.plainFn}, number ${dev.number}, signal accessor ${dev.signal}; prod: plain function ${prod.plainFn} (silently accepted), signal ${prod.signal}`,
  };
}
