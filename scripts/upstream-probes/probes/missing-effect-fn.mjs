export const claim =
  'In the dev build, `createEffect(compute)` with no effect function throws `[MISSING_EFFECT_FN]`: Solid 2 effects are two-phase and both arguments are required (a derivation is a memo; a one-shot side effect is a plain call). The prod build dies on the same call with an uncoded `TypeError` instead.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { createEffect, createRoot } from "solid-js";
const attempt = (fn) => { try { fn(); return "ok"; } catch (e) { return String(e?.message ?? e); } };
let single, two;
createRoot(() => {
  single = attempt(() => createEffect(() => 1));
  two = attempt(() => createEffect(() => 1, () => {}));
});
console.log(JSON.stringify({ single, two }));`;

export async function probe(h) {
  const dev = h.nodeJson(script, { conditions: ['browser', 'development'] });
  const prod = h.nodeJson(script, { conditions: ['browser'] });
  return {
    reproduces:
      dev.single.startsWith('[MISSING_EFFECT_FN]') && dev.two === 'ok' && prod.two === 'ok' && !prod.single.includes('MISSING_EFFECT_FN') && prod.single !== 'ok',
    observed: `dev single-arg: ${dev.single.slice(0, 60)}…; dev two-arg: ${dev.two}; prod single-arg: ${prod.single.slice(0, 60)}…; prod two-arg: ${prod.two}`,
  };
}
