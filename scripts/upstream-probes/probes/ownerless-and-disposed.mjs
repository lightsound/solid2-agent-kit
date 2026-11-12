export const claim =
  'In the dev build, creating reactive work with no owner warns instead of disposing it later: an effect created outside any root or component warns `[NO_OWNER_EFFECT]`, a boundary invoked outside a reactive context warns `[NO_OWNER_BOUNDARY]`, and `runWithOwner` with an already-disposed owner warns `[RUN_WITH_DISPOSED_OWNER]`. A detached `owner.dispose` is a method and throws when called unbound — the function to pass around is `createRoot`\'s `dispose` argument. The same creations under a live owner warn nothing; the prod build does not check.';
export const packages = ['solid-js', '@solidjs/signals'];

const script = `import { Loading, createEffect, createRoot, flush, getOwner, runWithOwner } from "solid-js";
createEffect(() => 1, () => {});
Loading({ fallback: "fb", get children() { return "x"; } });
let owner, dispose, detached;
createRoot((d) => { dispose = d; owner = getOwner(); createEffect(() => 1, () => {}); });
try { const f = owner.dispose; f(); detached = "ok"; } catch { detached = "threw"; }
dispose();
runWithOwner(owner, () => {});
flush();
console.log(JSON.stringify({ detached }));`;

export async function probe(h) {
  const dev = h.nodeJson(script, { conditions: ['browser', 'development'] });
  const prod = h.node(script, { conditions: ['browser'] });
  const codes = ['NO_OWNER_EFFECT', 'NO_OWNER_BOUNDARY', 'RUN_WITH_DISPOSED_OWNER'];
  const found = codes.filter((c) => dev.stderr.includes(`[${c}]`));
  const onceEach = codes.every((c) => dev.stderr.split(`[${c}]`).length - 1 <= 3);
  return {
    reproduces: found.length === 3 && onceEach && dev.detached === 'threw' && !codes.some((c) => prod.stderr.includes(`[${c}]`)),
    observed: `dev warned ${found.join(', ')} (the effect created inside the root warned nothing); detached owner.dispose ${dev.detached}; prod warned none`,
  };
}
