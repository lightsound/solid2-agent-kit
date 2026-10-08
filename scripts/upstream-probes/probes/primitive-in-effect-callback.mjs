export const claim =
  'In the dev build, creating a memo, an effect, or a root inside an effect\'s apply callback throws `[PRIMITIVE_IN_EFFECT_CALLBACK]` (the effect phase has no owner to dispose them), a detached `runWithOwner(null, () => createRoot(…))` included, while `runWithOwner(owner, …)` with an owner captured in the body is allowed; rc.13 allowed all of it. The prod build does not check.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { createEffect, createMemo, createRoot, createSignal, flush, getOwner, runWithOwner } from "solid-js";
const out = {};
const attempt = (key, fn) => {
  try { fn(); out[key] = "ok"; } catch (e) { out[key] = String(e?.message ?? e).match(/^\\[([A-Z_]+)\\]/)?.[1] ?? "threw"; }
};
const [s, setS] = createSignal(0);
createRoot(() => {
  const owner = getOwner();
  createEffect(() => s(), (v) => {
    if (v !== 1) return;
    attempt("memo", () => createMemo(() => v));
    attempt("root", () => createRoot((dispose) => dispose()));
    attempt("effect", () => createEffect(() => v, () => {}));
    attempt("detached", () => runWithOwner(null, () => createRoot((dispose) => dispose())));
    attempt("owned", () => runWithOwner(owner, () => createMemo(() => v)));
  });
});
flush();
setS(1);
flush();
console.log(JSON.stringify(out));
process.exit(0);`;

export async function probe(h) {
  const dev = h.nodeJson(script, { conditions: ['browser', 'development'] });
  const prod = h.nodeJson(script, { conditions: ['browser'] });
  const code = 'PRIMITIVE_IN_EFFECT_CALLBACK';
  const devThrows = dev.memo === code && dev.root === code && dev.effect === code && dev.detached === code && dev.owned === 'ok';
  const prodSilent = prod.memo === 'ok' && prod.root === 'ok';
  return {
    reproduces: devThrows && prodSilent,
    observed: `dev: memo ${dev.memo}, root ${dev.root}, effect ${dev.effect}, runWithOwner(null) root ${dev.detached}, runWithOwner(owner) memo ${dev.owned}; prod: memo ${prod.memo}, root ${prod.root}, effect ${prod.effect}`,
  };
}
