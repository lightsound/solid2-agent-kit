// Pattern scanners: the pure source-text checks behind the CHECKS registry
// that check.mjs runs. No filesystem access — content in, findings out.


// Balanced-scan helpers for the effect-sync check: regexes cannot pair the
// parentheses of a createEffect(...) call, so scan (string-aware; comments
// are already stripped) for the matching closer from an opening bracket.
function scanBalanced(content, openIndex) {
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < content.length; i += 1) {
    const ch = content[i];
    if (quote !== null) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '(' || ch === '{' || ch === '[') {
      depth += 1;
    } else if (ch === ')' || ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelArgs(argsText) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < argsText.length; i += 1) {
    const ch = argsText[i];
    if (quote !== null) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '(' || ch === '{' || ch === '[') {
      depth += 1;
    } else if (ch === ')' || ch === '}' || ch === ']') {
      depth -= 1;
    } else if (ch === ',' && depth === 0) {
      parts.push(argsText.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(argsText.slice(start));
  return parts;
}

// An apply phase that is nothing but one (optionally if-guarded) call to a
// local signal setter is "a signal plus an effect that syncs it" — rule 4.
// Restricting to setters declared via createSignal destructuring in the same
// file keeps external set* functions (setDefaultOptions, setTimeout) out.
function soleLocalSetterApply(apply, localSetters) {
  const head = apply.match(
    /^(?:async\s*)?(?:\([^()]*\)|[\w$]+)\s*=>\s*\{?\s*(?:if\s*\((?:[^()]|\([^()]*\))*\)\s*\{?\s*)?(set[A-Z][\w$]*)\s*\(/,
  );
  if (!head || !localSetters.has(head[1])) return false;
  const close = scanBalanced(apply, head[0].length - 1);
  if (close === -1) return false;
  return /^[\s;}]*$/.test(apply.slice(close + 1));
}

const LOCAL_SETTER_DECL = /\[\s*[\w$]+\s*,\s*(set[A-Z][\w$]*)\s*\]\s*=\s*createSignal\b/g;

// A store setter callback is a synchronous transaction — the draft closes when
// the callback returns, so `setStore(async (draft) => …)` loses every write
// after its first await (Solid 2.0.0-rc.9 throws ASYNC_STORE_SETTER in dev).
// Signals may hold promises, so only setters declared via createStore /
// createOptimisticStore destructuring in the same file are checked.
const LOCAL_STORE_SETTER_DECL =
  /\[\s*[\w$]+\s*,\s*(set[A-Z][\w$]*)\s*\]\s*=\s*create(?:Optimistic)?Store\b/g;

function storeSetterAsyncFindings(content) {
  const setters = new Set([...content.matchAll(LOCAL_STORE_SETTER_DECL)].map((m) => m[1]));
  if (setters.size === 0) return [];
  const findings = [];
  for (const call of content.matchAll(/(?<![.\w$])(set[A-Z][\w$]*)\s*\(\s*async\b/g)) {
    if (setters.has(call[1])) findings.push({ index: call.index });
  }
  return findings;
}

function effectSyncFindings(content) {
  const localSetters = new Set([...content.matchAll(LOCAL_SETTER_DECL)].map((m) => m[1]));
  if (localSetters.size === 0) return [];
  const matches = [];
  for (const call of content.matchAll(/\bcreateEffect\s*(?:<[^>()]*>)?\s*\(/g)) {
    const open = call.index + call[0].length - 1;
    const close = scanBalanced(content, open);
    if (close === -1) continue;
    const args = splitTopLevelArgs(content.slice(open + 1, close));
    if (args.length >= 2 && soleLocalSetterApply(args[1].trim(), localSetters)) {
      matches.push({ index: call.index });
    }
  }
  return matches;
}

// Core `action` (solid-js) takes a generator (`function*` / `async function*`)
// so `yield` can re-enter the transaction; router `formAction` (@solidjs/router,
// and its deprecated `action` alias) legitimately takes `async (form) => ...`.
// Only flag `action(async` when this file's `action` comes from "solid-js" — a
// router import (or none) stays silent.
function actionAsyncFindings(content) {
  if (!/import\s*\{[^}]*\baction\b[^}]*\}\s*from\s*['"]solid-js['"]/.test(content)) return [];
  if (/import\s*\{[^}]*\baction\b[^}]*\}\s*from\s*['"]@solidjs\/router['"]/.test(content)) return [];
  return [...content.matchAll(/\baction\s*\(\s*async(?!\s+function\s*\*)/g)].map((match) => ({
    index: match.index,
  }));
}

// Solid 1.x signatures: `createEffect(fn)` (Solid 2 needs compute + apply),
// `createEffect(fn, initialValue)`, and `createMemo(fn, initialValue[, options])`
// (Solid 2's second memo argument is the options object). A second argument
// that is a primitive or array literal is an initial value; functions,
// identifiers, and object literals are left alone. A name this file imports
// from another library (effector's one-argument `createEffect`) or declares
// itself is not Solid's.
const INITIAL_VALUE_LITERAL = /^(?:-?\d|['"`[]|true\b|false\b|null\b|undefined\b)/;
const NOT_SOLID_CORE_MODULE = /^(?!(?:solid-js|@solidjs\/signals)$)/;

// Blank type-argument lists (`Record<string, number>`, `Map<K, () => void>`)
// so their commas do not split arguments. `<` counts only right after an
// identifier: formatted comparisons have a space before it.
function blankTypeArguments(text) {
  let previous;
  do {
    previous = text;
    text = text.replace(/(?<=[\w$])<(?:=>|[^<>=])*>/g, (typeArgs) => ' '.repeat(typeArgs.length));
  } while (text !== previous);
  return text;
}

function solid1SignatureFindings(content) {
  const foreign = importedNames(content, NOT_SOLID_CORE_MODULE);
  const matches = [];
  for (const call of content.matchAll(
    /(?<![.\w$])create(Effect|Memo)\s*(?:<(?:=>|[^<>]|<(?:=>|[^<>])*>)*>)?\s*\(/g,
  )) {
    const name = `create${call[1]}`;
    if (foreign.has(name)) continue;
    if (new RegExp(`\\b(?:function\\s*\\*?|const|let|var|class)\\s+${name}\\b`).test(content)) continue;
    const open = call.index + call[0].length - 1;
    const close = scanBalanced(content, open);
    if (close === -1) continue;
    const args = splitTopLevelArgs(blankTypeArguments(content.slice(open + 1, close)))
      .map((arg) => arg.trim())
      .filter(Boolean);
    const initialValue = args.length >= 2 && INITIAL_VALUE_LITERAL.test(args[1]);
    const legacy =
      call[1] === 'Effect' ? args.length === 1 || initialValue : args.length >= 3 || initialValue;
    if (legacy) matches.push({ index: call.index });
  }
  return matches;
}

// `key` is meaningless in Solid JSX except on the Solid Meta tags, where it
// names the tag's identity (`<Meta key="og-image" …>`). The enclosing tag is
// the nearest `<Name` (or `<Namespace.Name`) before the attribute.
const META_MODULE = /^@solidjs\/meta$/;

function reactKeyPropFindings(content) {
  const metaTags = importedNames(content, META_MODULE);
  const metaNamespaces = new Set(
    [...content.matchAll(/\bimport\s+\*\s+as\s+([\w$]+)\s+from\s*['"]@solidjs\/meta['"]/g)].map((m) => m[1]),
  );
  const matches = [];
  for (const attr of content.matchAll(/\skey=\{/g)) {
    const opener = [...content.slice(0, attr.index).matchAll(/<([A-Za-z][\w$.]*)/g)].pop();
    const tag = opener?.[1] ?? '';
    if (metaTags.has(tag) || metaNamespaces.has(tag.split('.')[0])) continue;
    matches.push({ index: attr.index });
  }
  return matches;
}

// TanStack Router for Solid exports names the Next.js / Solid Router 1.x rules
// target (`useRouter()`, `notFound()`, `<Navigate>`). A match is exempt only
// when this file binds that exact local name from one of these modules, so a
// stray Next or Router 1.x call in the same file is still reported. TanStack
// Router 1.x (Solid 1) and 2.x (Solid 2) export the same names from the same
// module, so the major is invisible here; doctor's tanstack-router-version
// reads it from package.json / node_modules.
const TANSTACK_ROUTER_MODULE = /^@tanstack\/(?:solid-router|router-core)$/;

// `<Loading on={id}>` hands the boundary an accessor: `on` is a tracked
// expression whose value is irrelevant, so a bare accessor is never read and
// the boundary never re-arms. `on={id()}`, `on={props.id}` and
// `on={[a(), b()]}` do not match. The opening tag is scanned to its own `>`
// (braces balanced) so a `fallback={<p>…</p>}` before `on` does not end it.
function loadingOnAccessorFindings(content) {
  const matches = [];
  for (const tag of content.matchAll(/<Loading\b/g)) {
    let index = tag.index + tag[0].length;
    let depth = 0;
    while (index < content.length) {
      const ch = content[index];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
      index += 1;
    }
    const bare = content.slice(tag.index, index).match(/\son=\{\s*[A-Za-z_$][\w$]*\s*\}/);
    if (bare) matches.push({ index: tag.index + bare.index });
  }
  return matches;
}

// Local names bound by `import [Default,] { a, b as c } from "<module>"`.
export function importedNames(content, moduleName) {
  const names = new Set();
  for (const decl of content.matchAll(
    /\bimport\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    if (!moduleName.test(decl[2])) continue;
    for (const specifier of decl[1].split(',')) {
      const local = specifier.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop();
      if (local) names.add(local);
    }
  }
  return names;
}

export const CHECKS = [
  {
    id: 'props-destructure-param',
    pattern: /function\s+[A-Z]\w*\s*\(\s*\{|(?:const|let)\s+[A-Z]\w*\s*=\s*(?:async\s*)?\(\s*\{/g,
    message:
      'Destructured component props read getters once at setup and break reactivity. Take a single `props` parameter and read `props.x` inside JSX, memos, or effect computes.',
  },
  {
    id: 'props-destructure-body',
    pattern: /\}\s*=\s*props\b/g,
    message:
      'Destructuring `props` freezes the values. Keep `props.x` property accesses; name derivations instead: `const x = () => props.x`.',
  },
  {
    id: 'react-import',
    pattern: /from\s+['"]react(?:-dom)?(?:['"]|\/)/g,
    message: 'React import in a Solid 2.0 codebase.',
  },
  {
    id: 'solid1-import-path',
    pattern: /from\s+['"]solid-js\/(?:store|web|h|html|universal|jsx-runtime|jsx-dev-runtime)['"]/g,
    message:
      'Solid 1.x import path. Stores/merge/omit come from "solid-js"; render/hydrate/Portal/Dynamic come from "@solidjs/web".',
  },
  {
    id: 'jsx-namespace-import',
    pattern: /import\s+(?:type\s+)?\{[^}]*\bJSX\b[^}]*\}\s*from\s+['"]solid-js['"]/g,
    message:
      'Solid 2 does not export a `JSX` namespace from "solid-js" (TS2305). Import `JSX` from "@solidjs/web" (JSX.Element, JSX.IntrinsicElements, JSX.CSSProperties), or use `Element` from "solid-js" (aliased, e.g. `type Element as SolidElement`, where the DOM Element is also used).',
  },
  {
    id: 'solid1-effect-memo-signature',
    find: solid1SignatureFindings,
    message:
      'Solid 1.x signature. createEffect takes (compute, apply) — a single argument is an error in Solid 2. createMemo(fn, initialValue) is gone: the second argument is the options object; give the compute a default parameter instead (createMemo((prev = 0) => ...)).',
  },
  {
    id: 'projection-destructure',
    pattern: /\b(?:const|let|var)\s*\[[^\]]*\]\s*=\s*createProjection\b/g,
    message:
      'createProjection returns the store itself, not a [store, setter] tuple — destructuring it takes the first row. Write `const rows = createProjection(...)`.',
  },
  {
    // A two-phase createEffect whose apply is nothing but one (optionally
    // if-guarded) call to a setter declared via createSignal in this file.
    id: 'effect-sync-signal',
    find: effectSyncFindings,
    message:
      'Effect that only syncs a local signal — "state + effect" (rule 4). Derive the value instead; to reset state when another reactive value changes, use a writable derivation: createSignal(() => { source(); return initial; }).',
  },
  {
    id: 'react-jsx-prop',
    pattern: /\b(?:className|htmlFor)=/g,
    message: 'React JSX prop. Use `class` / `for`.',
  },
  {
    id: 'solid1-classlist',
    pattern: /\bclassList=/g,
    message:
      'Solid 1.x `classList` was removed (a compile error on native elements since 2.0.0-rc.17). Use the object/array form of `class`.',
  },
  {
    id: 'react-hook',
    pattern:
      /(?<![.\w])use(?:State|Effect|Memo|Ref|Callback|Reducer|LayoutEffect|Transition|SyncExternalStore|ImperativeHandle|Id|DeferredValue|InsertionEffect|Optimistic|ActionState|FormStatus)\s*\(/g,
    message: 'React hook. See the primitive mapping in the solid-2 rules.',
  },
  {
    id: 'solid1-api',
    pattern:
      /(?<![.\w])(?:createResource|onMount|createMutable|modifyMutable|mergeProps|splitProps|produce|unwrap|createComputed|createSelector|startTransition|batch|onError|catchError|createDynamic|renderToStringAsync|clearDelegatedEvents)\s*\(/g,
    message:
      'Removed Solid 1.x API. Replacements: async createMemo, onSettled, createStore drafts, merge/omit/snapshot, automatic batching, Errored, dynamic(), renderToStream.',
  },
  {
    id: 'solid1-component',
    pattern: /<(?:Suspense|ErrorBoundary|SuspenseList|Index)[\s/>]/g,
    message: 'Solid 1.x component. Use <Loading>, <Errored>, <Reveal>, <For keyed={false}>.',
  },
  {
    id: 'context-provider',
    pattern: /<\w+\.Provider\b/g,
    message: 'Solid 2 contexts are their own provider: `<MyContext value={...}>`.',
  },
  {
    // Matches a camelCase key in property position (right after `{{` or after a
    // comma). Ternary branches inside values (`a ? fooBar : baz`) never sit in
    // property position, so they are not flagged.
    id: 'style-camelcase',
    pattern: /style=\{\{\s*(?:[^{}]*,\s*)?[a-z]+[A-Z]\w*\s*:/g,
    message:
      'camelCase style key. Solid style objects use CSS property names: `"background-color"` (and no automatic px).',
  },
  {
    id: 'react-key-prop',
    find: reactKeyPropFindings,
    message:
      'React `key` prop has no meaning in Solid. Row identity belongs on <For keyed={...}>. (Only the @solidjs/meta tags take `key`, as the tag identity.)',
  },
  {
    // `{todos().map((t) => <Row />)}` renders then recreates every row.
    // `children().toArray().map` does not match (method is toArray, not a bare accessor).
    id: 'jsx-accessor-map',
    pattern: /\{\s*[A-Za-z_$][\w$]*\(\)\.map\s*\(/g,
    message:
      '`.map()` over a reactive accessor in JSX recreates every row. Use <For each={...}> (and a key function for server/refetched rows).',
  },
  {
    id: 'for-each-map',
    pattern: /\beach=\{\s*[^}]*\.map\s*\(/g,
    message:
      '<For each={list().map(...)}> still rebuilds the array every run. Derive the list first, then pass that list to each={...}.',
  },
  {
    id: 'props-rest-copy',
    pattern: /=\s*\{\s*\.\.\.\s*props\b/g,
    message:
      '`{ ...props }` is a snapshot. Forward leftover props with omit(props, "key") (a reactive proxy), then JSX-spread that.',
  },
  {
    // A non-null assertion on a zero-arg call is almost always a reactive read
    // narrowed by hand (`error()!.message`). Common zero-arg stdlib methods
    // that legitimately pair with `!` are excluded.
    id: 'accessor-non-null',
    pattern: /(?<!\.pop|\.shift|\.next)\(\)!/g,
    message:
      'Non-null assertion on a zero-arg call. Narrow reactive reads with <Show when={...}> and its function child (narrowed accessor); use an explicit guard variable for non-reactive calls.',
  },
  {
    id: 'manual-loading-signal',
    pattern: /\[\s*(?:is)?[Ll]oading\s*,|\bset(?:Is)?Loading\s*\(/g,
    message:
      'Hand-rolled loading state. First-load UI belongs to a <Loading> fallback, refetch indicators to isPending(), in-flight values to latest(). Model the async work as a computation (promise / async iterable), not signals.',
  },
  {
    id: 'react-lazy',
    pattern: /\bReact\.lazy\s*\(/g,
    message: 'React.lazy. Use `lazy(() => import("./X"))` from "solid-js" and read it under <Loading>.',
  },
  {
    id: 'lazy-then-wrapper',
    pattern: /\blazy\(\s*\(\)[\s\S]{0,160}?\.then\s*\(/g,
    message:
      'lazy().then((m) => ({ default: m.X })) breaks hydration. Pass { export: "X" } as the second argument: lazy(() => import("./mod"), { export: "X" }).',
  },
  {
    id: 'dangerously-set-inner-html',
    pattern: /\bdangerouslySetInnerHTML=/g,
    message: 'React innerHTML prop. Use innerHTML={sanitizedHtml()} from Solid, never combined with JSX children.',
  },
  {
    id: 'setter-as-handler',
    pattern: /\bon[A-Z][A-Za-z]*=\{\s*set[A-Z]\w*\s*\}/g,
    message:
      'Passing a setter as an event handler writes the event object. Wrap it: onClick={() => setCount((c) => c + 1)}.',
  },
  {
    id: 'vite-plugin-solid',
    pattern: /from\s+['"]vite-plugin-solid['"]/g,
    message: 'Solid 1.x Vite plugin. Import `solid` from "@solidjs/vite-plugin".',
  },
  {
    // Valueless attributes count too (`<input use:autofocus />`): followed by
    // `/>`, `>`, or another attribute, unlike an unspaced object key
    // (`{ on:true }`, `{ on:x = false }`, `{ attr:v as string }`); `as="font"`
    // and SVG `in="…"` are still attributes. `prop:` is still a Solid 2
    // namespace and is not listed.
    id: 'solid1-jsx-namespace',
    pattern:
      /(?<=\s)(?:use|on|oncapture|attr|bool):[A-Za-z][\w-]*(?==|\s*\/?>|\s+(?!(?:as|satisfies|in|instanceof)\b(?!\s*=))[A-Za-z_${])/g,
    message:
      'Solid 1.x JSX namespace — a compile error on native elements since 2.0.0-rc.17. Use ref callbacks (and directive factories), camelCase event props, and standard attributes; `prop:` remains for DOM properties.',
  },
  {
    id: 'solid1-router',
    pattern: /<(?:HashRouter|MemoryRouter|Route|Navigate|A|FileRoutes|StartClient|StartServer)\b/g,
    exemptImportsFrom: TANSTACK_ROUTER_MODULE,
    message:
      'Solid Router 0.x/1.x or SolidStart JSX. Define routes with createRouter({ routes }) / fileRoutes(pageRoutes) and plain <a href={Router.paths...}> (link state: automatic aria-current/data-active + CSS, data-pending via createRouter({ links: pendingLinks }), or useLinkState).',
  },
  {
    id: 'meta-provider',
    pattern: /<MetaProvider\b/g,
    message: 'Solid Meta 1.x has no provider. Render <Title>/<Meta>/<Link> from "@solidjs/meta" anywhere.',
  },
  {
    id: 'solidstart-import',
    pattern: /from\s+['"](?:@solidjs\/start|vinxi|h3|nitropack)(?:['"]|\/)/g,
    message:
      'SolidStart leftover. Import GET from "@solidjs/web/server-functions"; routes are createRouter / fileRoutes(pageRoutes), not @solidjs/start, vinxi, h3, or nitropack.',
  },
  {
    id: 'solidstart-api',
    pattern: /(?<![.\w])(?:createAsync|createAsyncStore|useSubmission|defineEventHandler)\s*\(/g,
    message:
      'SolidStart / Router 0.x leftover. Read query() through createMemo(() => getUser(id())); settled results via useSubmissions (plural); replace cache()/json() with query/respond; rewrite H3 handlers against Request/Response.',
  },
  {
    id: 'use-client',
    pattern: /['"]use client['"]/g,
    message: 'React/Next client directive. Solid has no "use client"; server functions use "use server" only.',
  },
  {
    id: 'next-import',
    pattern: /from\s+['"]next(?:['"]|\/)/g,
    message: 'Next.js import in a Solid 2.0 codebase. Use @solidjs/router, @solidjs/meta, and @solidjs/web.',
  },
  {
    id: 'render-jsx-element',
    pattern: /\b(?:render|hydrate|renderToString|renderToStream)\(\s*</g,
    message:
      'Pass a function to render/hydrate/renderToString/renderToStream so Solid creates the root first: render(() => <App />, root).',
  },
  {
    id: 'typeof-window',
    pattern: /typeof\s+window\b/g,
    message:
      '`typeof window` is not the SSR boundary. Use isServer / isDev from "@solidjs/web", or clientOnly(() => import("./Widget")).',
  },
  {
    id: 'next-nav',
    pattern:
      /(?<![.\w])(?:useRouter|usePathname|revalidatePath|revalidateTag|notFound|hydrateRoot)\s*\(/g,
    exemptImportsFrom: TANSTACK_ROUTER_MODULE,
    message:
      'Next.js / React DOM leftover. In-app navigation is useNavigate / <a href={Router.paths...}>; 404 is httpStatus(404); hydrate is hydrate(() => <App />, root).',
  },
  {
    id: 'react-dom-event',
    pattern: /\b(?:onDoubleClick|onKeyPress|suppressHydrationWarning)=/g,
    message:
      'React DOM prop. Native dblclick is onDblClick; keypress is onKeyDown; Solid has no suppressHydrationWarning.',
  },
  {
    // Only `on` + uppercase binds an event: since rc.14 a lowercase `on*`
    // attribute is a plain attribute (dev warns [LOWERCASE_EVENT_ATTRIBUTE])
    // that never runs the handler; a 1.x `on:click` on a native element is a
    // compile error since rc.17 (solid1-jsx-namespace, above). A real event name in lowercase is always a leftover. Anchored
    // on `={` (a JSX expression attribute): `const onmessage = ...`,
    // `ws.onerror = fn`, and HTML strings (`onerror="…"`) are not matches,
    // and neither is a string expression (`onclick={"track()"}`) — a string
    // inline-handler attribute is the one legitimate lowercase use. The names
    // are the GlobalEventHandlers / WindowEventHandlers set, so a custom
    // attribute that merely starts with `on` (`one={…}`) is never flagged.
    id: 'solid1-lowercase-event',
    pattern:
      /(?<=\s)on(?:abort|afterprint|animation(?:cancel|end|iteration|start)|auxclick|beforeinput|beforematch|beforeprint|beforetoggle|beforeunload|blur|cancel|canplay|canplaythrough|change|click|close|command|contextlost|contextmenu|contextrestored|copy|cuechange|cut|dblclick|drag|dragend|dragenter|dragleave|dragover|dragstart|drop|durationchange|emptied|ended|error|focus|focusin|focusout|formdata|fullscreenchange|fullscreenerror|gotpointercapture|hashchange|input|invalid|keydown|keypress|keyup|languagechange|load|loadeddata|loadedmetadata|loadstart|lostpointercapture|message|messageerror|mousedown|mouseenter|mouseleave|mousemove|mouseout|mouseover|mouseup|offline|online|pagehide|pagereveal|pageshow|pageswap|paste|pause|play|playing|pointercancel|pointerdown|pointerenter|pointerleave|pointermove|pointerout|pointerover|pointerrawupdate|pointerup|popstate|progress|ratechange|rejectionhandled|reset|resize|scroll|scrollend|search|securitypolicyviolation|seeked|seeking|select|selectionchange|selectstart|slotchange|stalled|storage|submit|suspend|timeupdate|toggle|touchcancel|touchend|touchmove|touchstart|transitioncancel|transitionend|transitionrun|transitionstart|unhandledrejection|unload|volumechange|waiting|wheel)\s*=\s*\{(?!\s*["'`])/g,
    message:
      'Lowercase `on*` is a plain attribute in Solid 2 (dev warns [LOWERCASE_EVENT_ATTRIBUTE]), not an event binding. Use the camelCase prop (onClick).',
  },
  {
    // `preloadLinks` takes link preload strategies since @solidjs/router
    // 2.0.0-next.38 and preloads nothing by default: `true` (the old on switch)
    // preloads nothing and only warns in dev, and `false` is a no-op.
    id: 'preload-links-boolean',
    pattern: /(?<![\w$])["']?preloadLinks["']?\s*:\s*(?:true|false)\b/g,
    message:
      '`preloadLinks` takes link preload strategies, not a boolean, and preloads nothing by default. Hover/focus warming is preloadLinks: intentPreload() (from "@solidjs/router"); for none, omit the option.',
  },
  {
    id: 'history-nav',
    pattern: /\b(?:history\.pushState|history\.replaceState|window\.location\.href\s*=)/g,
    message:
      'Bypass of the router. In-app navigation is useNavigate() or <a href={Router.paths...}>.',
  },
  {
    // A zero-arg call compared against undefined/null is a manual async
    // readiness branch (`data() === undefined ? ... : ...`).
    id: 'async-undefined-check',
    pattern: /\(\)\s*[!=]==?\s*(?:undefined|null)\b|\b(?:undefined|null)\s*[!=]==?\s*\w+\(\)/g,
    message:
      'Readiness branch on a zero-arg call. Read async values under <Loading> (first load) / isPending() (refetch) and let errors reach <Errored>. For non-reactive utils, assign to a variable and test that.',
  },
  {
    // `isPending(user())` / `latest(data())` evaluate the read before the
    // helper runs. `isPending(user)` and `isPending(() => user())` do not match.
    id: 'pending-accessor-call',
    pattern: /(?<![.\w])(?:isPending|latest)\(\s*[A-Za-z_$][\w$]*\(\s*\)/g,
    message:
      'Pass the accessor to isPending/latest, not the call: isPending(user), not isPending(user()). Calling it first evaluates the read before the helper runs.',
  },
  {
    // `<Loading on={id}>` — the accessor is never read, so `on` never re-arms.
    id: 'loading-on-accessor',
    find: loadingOnAccessorFindings,
    message:
      '`on` is a tracked dependency list, not a key: a bare accessor is never read, so the boundary never re-arms. Read it — on={id()} — or list several inputs: on={[a(), b()]}.',
  },
  {
    id: 'dynamic-jsx',
    pattern: /<Dynamic[\s/>]/g,
    message:
      '`<Dynamic>` is deprecated (Solid 2.0.0-rc.9). Hoist a component with dynamic(() => ...) from "@solidjs/web" so the factory is built once and the component identity stays stable.',
  },
  {
    // `setStore(async (draft) => …)` on a setter declared via createStore /
    // createOptimisticStore in this file — the draft closes before the await
    // resumes. `setSignal(async …)` is not flagged (a signal may hold a promise).
    id: 'store-setter-async',
    find: storeSetterAsyncFindings,
    message:
      'Store setter callbacks are synchronous transactions — writes after the first `await` are lost (dev throws [ASYNC_STORE_SETTER]). Await outside, then call the setter with a synchronous draft mutation (inside an action, `yield` first).',
  },
  {
    // `action(async (item) => ...)` with core `action` never re-enters the
    // transaction — `action(async function* ...)` does not match.
    id: 'action-plain-async',
    find: actionAsyncFindings,
    message:
      'Core `action` takes a generator (`function*` / `async function*`), not a plain async function — only `yield` re-enters the transaction, so writes after a bare `await` commit immediately. (Router `formAction` from "@solidjs/router" is the one that takes `async (form) => ...`.)',
  },
  {
    // `action` / `Action` from "@solidjs/router" are deprecated aliases of
    // `formAction` / `FormAction` since 2.0.0-next.41 (dev warns on the first
    // call); `action` is solid-js's own primitive.
    id: 'router-action-alias',
    find: (content) => routerImportFindings(content, ['action', 'Action']),
    message:
      'Router `action` / `Action` are deprecated aliases (@solidjs/router 2.0.0-next.41; dev warns). Import `formAction` / `FormAction` from "@solidjs/router" — `action` is solid-js\'s own primitive.',
  },
  {
    // `useAction` is deprecated with no replacement: a mounted router applies a
    // server function's revalidation and redirect on any call.
    id: 'router-use-action',
    find: (content) => routerImportFindings(content, ['useAction']),
    message:
      '`useAction` is deprecated (@solidjs/router 2.0.0-next.41; dev warns): outside a form, call the server function (or a core `action` from "solid-js") directly — the router applies its revalidation and redirect either way. Bind form actions to forms.',
  },
];

// Named imports (and re-exports) from "@solidjs/router" or its `/data` subpath
// among `names`, located at the name inside the import list. Only the imported
// name counts: `action as save` is flagged, `formAction as action` (the local
// name) is not.
function routerImportFindings(content, names) {
  const findings = [];
  for (const statement of content.matchAll(/(?:import|export)\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@solidjs\/router(?:\/data)?['"]/g)) {
    const list = statement[1];
    const offset = statement.index + statement[0].indexOf(list);
    for (const name of names) {
      for (const match of list.matchAll(new RegExp(`(?<![\\w$.])(?<!\\bas\\s+)(?:type\\s+)?${name}(?![\\w$])`, 'g'))) {
        findings.push({ index: offset + match.index });
      }
    }
  }
  return findings;
}

// .ts / .tsx / .jsx sources, excluding .d.ts declaration files.
