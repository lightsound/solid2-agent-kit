export const claim =
  'For context, `undefined` means "not provided": `createContext(undefined)` is the default-less form and a provider whose `value` is `undefined` counts as no provider, so `useContext` throws `ContextNotFoundError` (dev names the context and points at `createContext<T | null>(null)`); a provided `null` is a value and is returned.';
export const packages = ['solid-js', '@solidjs/signals'];

export async function probe(h) {
  const r = h.nodeJson(
    `import { createRoot, createContext, useContext, createComponent, flush } from "solid-js";
     const Ctx = createContext(undefined, "Session");
     const read = (value) => {
       let got = "unread", error = null;
       try {
         createRoot(() => {
           const view = createComponent(Ctx, { value, get children() { got = useContext(Ctx); return null; } });
           if (typeof view === "function") view();
         });
         flush();
       } catch (e) { error = String(e?.message ?? e); }
       return { got: got === undefined ? "undefined" : got, error, name: error ? String(error.includes("ContextNotFoundError") || /ContextNotFound/.test(String(error))) : null };
     };
     let noProvider = null;
     try { createRoot(() => useContext(Ctx)); } catch (e) { noProvider = String(e?.message ?? e); }
     console.log(JSON.stringify({ undefinedValue: read(undefined), nullValue: read(null), noProvider }));`,
    { conditions: ['browser', 'development'] },
  );
  const throwsOnUndefined = r.undefinedValue.error !== null && r.undefinedValue.got === 'unread';
  const nullIsValue = r.nullValue.error === null && r.nullValue.got === null;
  const pointsAtNull = /createContext<T \| null>\(null\)|null/.test(r.undefinedValue.error ?? '');
  return {
    reproduces: throwsOnUndefined && nullIsValue && r.noProvider !== null,
    observed: `value={undefined}: ${r.undefinedValue.error ? `throws ${r.undefinedValue.error.slice(0, 140)}` : `read ${r.undefinedValue.got}`}; value={null}: ${r.nullValue.error ? `throws ${r.nullValue.error.slice(0, 80)}` : `read ${JSON.stringify(r.nullValue.got)}`}; no provider: ${r.noProvider ? r.noProvider.slice(0, 80) : 'no throw'}; message mentions the null form: ${pointsAtNull}`,
  };
}
