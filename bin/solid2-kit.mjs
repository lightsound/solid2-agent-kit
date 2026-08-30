#!/usr/bin/env node
// solid2-agent-kit CLI — installs and maintains Solid 2.0 guidance for AI
// coding agents (Cursor and Claude Code), and runs a mechanical pattern gate.
//
//   solid2-kit init  [--cursor] [--claude] [--no-hooks] [--target <dir>]
//   solid2-kit sync  [--cursor] [--claude] [--no-hooks] [--target <dir>]   (alias of init)
//   solid2-kit check [--dir <srcdir>] [--target <dir>] [files...]
//   solid2-kit doctor [--target <dir>]
//   solid2-kit hook (claude|cursor)          (stdin: agent hook JSON payload)
//
// `init`/`sync` are idempotent: kit-owned files are overwritten, managed
// blocks in AGENTS.md / CLAUDE.md are replaced in place, and hook entries in
// .cursor/hooks.json / .claude/settings.json are merged without duplicates.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const VERSION = JSON.parse(readFileSync(join(KIT_ROOT, 'package.json'), 'utf8')).version;

const args = process.argv.slice(2);
const command = args[0];

function flagValue(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 || index + 1 >= args.length ? fallback : args[index + 1];
}

const VALUE_FLAGS = new Set(['--dir', '--target']);

function positionalArgs() {
  const out = [];
  for (let i = 1; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
      if (VALUE_FLAGS.has(args[i])) i += 1;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

// --- init / sync ------------------------------------------------------------

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function upsertManagedBlock(filePath, blockId, body, createPreamble) {
  const start = `<!-- solid2-agent-kit:${blockId}:start -->`;
  const end = `<!-- solid2-agent-kit:${blockId}:end -->`;
  const note = `<!-- Managed by solid2-agent-kit v${VERSION}. Do not edit inside this block; run \`solid2-kit sync\` to update. -->`;
  const block = `${start}\n${note}\n\n${body.trim()}\n\n${end}`;

  let content = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const starts = countOccurrences(content, start);
  const ends = countOccurrences(content, end);

  if (starts === 1 && ends === 1) {
    // Function replacement: a plain string would have `$&`/`$'`-style
    // sequences in the body interpreted as replacement patterns.
    content = content.replace(new RegExp(`${start}[\\s\\S]*?${end}`), () => block);
  } else if (starts === 0 && ends === 0) {
    const base = content.trim() ? content.trimEnd() : (createPreamble ?? '').trimEnd();
    content = `${base}${base ? '\n\n' : ''}${block}\n`;
  } else {
    // Malformed markers (a stray delete or a duplicated block). Touching the
    // file could swallow user content between mismatched markers, so leave
    // it alone and ask for a manual fix.
    console.warn(
      `solid2-kit — warning: malformed managed-block markers in ${filePath} (${starts} start / ${ends} end for "${blockId}"). File left untouched; repair the markers and re-run sync.`,
    );
    return null;
  }
  writeFileSync(filePath, content);
  return filePath;
}

function writeKitOwnedFile(filePath, body) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, body);
  return filePath;
}

// Hook commands run from the project root without node_modules/.bin on PATH,
// so they invoke the locally installed kit through node directly. `init` only
// wires hooks when that file exists (kit installed as a dependency).
const KIT_LOCAL_BIN = 'node_modules/solid2-agent-kit/bin/solid2-kit.mjs';

function readJsonConfig(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(
      `solid2-kit — warning: ${filePath} is not valid JSON. File left untouched; fix it and re-run sync to wire the edit hook.`,
    );
    return null;
  }
}

function writeJsonConfig(filePath, config) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
  return filePath;
}

// Replace the existing kit-owned entry (identified by the marker in its
// command) or append a fresh one — sync then updates matchers/commands that
// changed between kit versions while leaving user entries untouched.
function upsertHookEntry(entries, marker, entry, matches) {
  const index = entries.findIndex((existing) => matches(existing, marker));
  if (index === -1) entries.push(entry);
  else entries[index] = entry;
}

const cursorEntryMatches = (entry, marker) =>
  typeof entry?.command === 'string' && entry.command.includes(marker);
const claudeEntryMatches = (entry, marker) =>
  (entry?.hooks ?? []).some((item) => typeof item?.command === 'string' && item.command.includes(marker));

// Cursor postToolUse hook: on every write- or shell-shaped tool call,
// `hook cursor` checks the touched sources and injects findings as
// additional_context.
function upsertCursorHook(target) {
  const filePath = join(target, '.cursor/hooks.json');
  const config = readJsonConfig(filePath);
  if (config === null) return null;
  config.version ??= 1;
  config.hooks ??= {};
  upsertHookEntry(
    (config.hooks.postToolUse ??= []),
    'solid2-kit.mjs hook cursor',
    { command: `node ${KIT_LOCAL_BIN} hook cursor` },
    cursorEntryMatches,
  );
  return writeJsonConfig(filePath, config);
}

// Claude Code hooks: PostToolUse (`hook claude` prints findings to stderr and
// exits 2, which Claude Code feeds back into the model as correction context;
// Bash is matched so shell edits via sed/heredocs are gated too) and Stop
// (whole-project final gate — the agent cannot end its turn with findings).
function upsertClaudeHook(target) {
  const filePath = join(target, '.claude/settings.json');
  const config = readJsonConfig(filePath);
  if (config === null) return null;
  config.hooks ??= {};
  const command = `node ${KIT_LOCAL_BIN} hook claude`;
  upsertHookEntry(
    (config.hooks.PostToolUse ??= []),
    'solid2-kit.mjs hook claude',
    { matcher: 'Edit|MultiEdit|Write|Bash', hooks: [{ type: 'command', command, timeout: 30 }] },
    claudeEntryMatches,
  );
  upsertHookEntry(
    (config.hooks.Stop ??= []),
    'solid2-kit.mjs hook claude',
    { hooks: [{ type: 'command', command, timeout: 60 }] },
    claudeEntryMatches,
  );
  return writeJsonConfig(filePath, config);
}

function copySkill(targetSkillDir) {
  // The skill directory is kit-owned: remove it first so files deleted in
  // newer kit versions do not linger after a sync.
  rmSync(targetSkillDir, { recursive: true, force: true });
  mkdirSync(targetSkillDir, { recursive: true });
  cpSync(join(KIT_ROOT, 'files/skills/solid-2'), targetSkillDir, { recursive: true });
  return targetSkillDir;
}

function init() {
  const target = resolve(flagValue('--target', '.'));
  const onlyCursor = args.includes('--cursor') && !args.includes('--claude');
  const onlyClaude = args.includes('--claude') && !args.includes('--cursor');
  const wantCursor = !onlyClaude;
  const wantClaude = !onlyCursor;

  const rulesBody = readFileSync(join(KIT_ROOT, 'files/shared/rules-body.md'), 'utf8');
  const agentsSection = readFileSync(join(KIT_ROOT, 'files/shared/agents-section.md'), 'utf8');
  const reviewCommand = readFileSync(join(KIT_ROOT, 'files/commands/solid2-review.md'), 'utf8');
  const written = [];

  if (wantCursor) {
    const mdc = [
      '---',
      'description: Solid 2.0 JSX and reactivity rules — prevents React and Solid 1.x patterns in TSX files',
      'globs: **/*.tsx,**/*.jsx',
      'alwaysApply: false',
      '---',
      '',
      `<!-- Generated by solid2-agent-kit v${VERSION}. Do not edit; run \`solid2-kit sync\` to update. -->`,
      '',
      rulesBody.trim(),
      '',
    ].join('\n');
    written.push(writeKitOwnedFile(join(target, '.cursor/rules/solid-2.mdc'), mdc));
    written.push(copySkill(join(target, '.cursor/skills/solid-2')));
    written.push(writeKitOwnedFile(join(target, '.cursor/commands/solid2-review.md'), reviewCommand));
  }

  if (wantClaude) {
    written.push(copySkill(join(target, '.claude/skills/solid-2')));
    written.push(writeKitOwnedFile(join(target, '.claude/commands/solid2-review.md'), reviewCommand));
    // Claude Code has no glob-attached rules mechanism; CLAUDE.md is always
    // loaded, so the full rules body lives there in a managed block.
    written.push(
      upsertManagedBlock(
        join(target, 'CLAUDE.md'),
        'solid-rules',
        rulesBody,
        '# CLAUDE.md\n\nProject guidance for Claude Code.',
      ),
    );
  }

  written.push(
    upsertManagedBlock(
      join(target, 'AGENTS.md'),
      'agents-section',
      agentsSection,
      '# AGENTS.md\n\nProject-specific context for coding agents.',
    ),
  );

  // Edit-time hooks: run the mechanical gate automatically on every agent
  // file edit, so enforcement does not depend on the agent remembering to
  // run `solid2-kit check`.
  let hooksNote = null;
  if (!args.includes('--no-hooks')) {
    if (existsSync(join(target, KIT_LOCAL_BIN))) {
      if (wantCursor) written.push(upsertCursorHook(target));
      if (wantClaude) written.push(upsertClaudeHook(target));
    } else {
      hooksNote =
        'edit-time hooks not wired: install the kit as a devDependency ("solid2-agent-kit": "github:lightsound/solid2-agent-kit") so `node node_modules/solid2-agent-kit/bin/solid2-kit.mjs` resolves, then re-run sync. Pass --no-hooks to silence this note.';
    }
  }

  console.log(`solid2-agent-kit v${VERSION} — installed for ${[wantCursor && 'Cursor', wantClaude && 'Claude Code'].filter(Boolean).join(' + ')}:`);
  for (const path of written.filter(Boolean)) console.log(`  ${relative(target, path) || '.'}`);
  if (hooksNote) console.log(`  note: ${hooksNote}`);
}

// --- check ------------------------------------------------------------------

const CHECKS = [
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
    id: 'react-jsx-prop',
    pattern: /\b(?:className|htmlFor)=/g,
    message: 'React JSX prop. Use `class` / `for`.',
  },
  {
    id: 'solid1-classlist',
    pattern: /\bclassList=/g,
    message: 'Solid 1.x `classList` was removed. Use the object/array form of `class`.',
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
      /(?<![.\w])(?:createResource|onMount|createMutable|modifyMutable|mergeProps|splitProps|produce|unwrap|createComputed|createSelector|createDeferred|startTransition|batch|onError|catchError|createDynamic|renderToStringAsync|clearDelegatedEvents)\s*\(/g,
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
    pattern: /\skey=\{/g,
    message: 'React `key` prop has no meaning in Solid. Row identity belongs on <For keyed={...}>.',
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
    id: 'solid1-jsx-namespace',
    pattern: /\b(?:use|on|oncapture|attr|bool):[A-Za-z][\w-]*=/g,
    message:
      'Solid 1.x JSX namespace. Use ref callbacks (and directive factories), camelCase event props, and standard attributes.',
  },
  {
    id: 'solid1-router',
    pattern: /<(?:HashRouter|MemoryRouter|Route|Navigate|A|FileRoutes|StartClient|StartServer)\b/g,
    message:
      'Solid Router 0.x/1.x or SolidStart JSX. Define routes with createRouter({ routes }) / fileRoutes(pageRoutes) and plain <a href={Router.paths...}>.',
  },
  {
    id: 'meta-provider',
    pattern: /<MetaProvider\b/g,
    message: 'Solid Meta 1.x has no provider. Render <Title>/<Meta>/<Link> from "@solidjs/meta" anywhere.',
  },
  {
    id: 'solidstart-import',
    pattern: /from\s+['"](?:@solidjs\/start|vinxi)(?:['"]|\/)/g,
    message:
      'SolidStart leftover. Import GET from "@solidjs/web/server-functions"; routes are createRouter / fileRoutes(pageRoutes), not @solidjs/start or vinxi.',
  },
  {
    id: 'solidstart-api',
    pattern: /(?<![.\w])(?:createAsync|createAsyncStore|useSubmission)\s*\(/g,
    message:
      'SolidStart / Router 0.x leftover. Read query() through createMemo(() => getUser(id())); settled results via useSubmissions (plural); replace cache()/json() with query/respond.',
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
    // A zero-arg call compared against undefined/null is a manual async
    // readiness branch (`data() === undefined ? ... : ...`).
    id: 'async-undefined-check',
    pattern: /\(\)\s*[!=]==?\s*(?:undefined|null)\b|\b(?:undefined|null)\s*[!=]==?\s*\w+\(\)/g,
    message:
      'Readiness branch on a zero-arg call. Read async values under <Loading> (first load) / isPending() (refetch) and let errors reach <Errored>. For non-reactive utils, assign to a variable and test that.',
  },
];

// .ts / .tsx / .jsx sources, excluding .d.ts declaration files.
const SOURCE_FILE = /(?<!\.d)\.(?:tsx?|jsx)$/;

// Blank comment interiors (preserving newlines and offsets) so banned tokens
// mentioned in comments ("migrated off createResource") do not trip the gate.
// String and template contents are preserved — some checks match string
// literals ("use client"). This is a heuristic scanner, not a JS lexer: a
// regex literal containing escaped slashes or `//` in JSX text can blank the
// remainder of that one line (false negatives only, never false positives).
function stripComments(content) {
  let out = '';
  let state = 'code';
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (state === 'code') {
      if (ch === '/' && (next === '/' || next === '*')) {
        state = next === '/' ? 'line' : 'block';
        out += '  ';
        i += 1;
      } else {
        if (ch === "'") state = 'single';
        else if (ch === '"') state = 'double';
        else if (ch === '`') state = 'template';
        out += ch;
      }
    } else if (state === 'line') {
      if (ch === '\n') state = 'code';
      out += ch === '\n' ? ch : ' ';
    } else if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i += 1;
      } else {
        out += ch === '\n' ? ch : ' ';
      }
    } else {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 1;
      } else if (
        (state === 'single' && ch === "'") ||
        (state === 'double' && ch === '"') ||
        (state === 'template' && ch === '`')
      ) {
        state = 'code';
      }
    }
  }
  return out;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (SOURCE_FILE.test(entry.name)) yield path;
  }
}

// One formatted finding per pattern match: "path:line [id] message\n  > source".
// Patterns run against comment-stripped content (same offsets); the quoted
// source line comes from the original file.
function fileFindings(file, relativeTo) {
  const raw = readFileSync(file, 'utf8');
  const content = stripComments(raw);
  const lines = raw.split('\n');
  const findings = [];
  for (const rule of CHECKS) {
    for (const match of content.matchAll(rule.pattern)) {
      const lineNumber = content.slice(0, match.index).split('\n').length;
      findings.push(
        `${relative(relativeTo, file) || file}:${lineNumber} [${rule.id}] ${rule.message}\n  > ${lines[lineNumber - 1].trim()}`,
      );
    }
  }
  return findings;
}

function check() {
  const target = resolve(flagValue('--target', '.'));
  const fileArgs = positionalArgs();

  let files;
  if (fileArgs.length > 0) {
    // Explicit file mode (used by agent hooks): check only the named sources.
    files = fileArgs.map((file) => resolve(target, file)).filter((file) => SOURCE_FILE.test(file));
  } else {
    const srcDir = resolve(target, flagValue('--dir', 'src'));
    if (!existsSync(srcDir)) {
      console.error(`solid2-kit check — source directory not found: ${srcDir} (use --dir)`);
      process.exit(2);
    }
    files = [...walk(srcDir)];
  }

  let findings = 0;
  for (const file of files) {
    for (const finding of fileFindings(file, target)) {
      findings += 1;
      console.error(finding);
    }
  }

  if (findings > 0) {
    console.error(`\nsolid2-kit check — ${findings} finding(s) in ${files.length} file(s).`);
    process.exit(1);
  }
  console.log(`solid2-kit check — OK (${files.length} files scanned).`);
}

// --- hook -------------------------------------------------------------------
// Edit-time gate wired by `init` into the agents' hook systems. Reads the
// hook JSON payload from stdin, runs the mechanical checks on the edited
// source files, and feeds findings back through each agent's channel:
//   claude — Claude Code PostToolUse: findings on stderr + exit 2 (Claude
//            sees the stderr and fixes; other exit codes are ignored). Also
//            handles the Stop event as a whole-project final gate: exit 2
//            blocks the agent from ending its turn with violations in place.
//   cursor — Cursor postToolUse: findings as {"additional_context"} JSON on
//            stdout (injected into the conversation after the tool result).
// Both agents also edit files through shell commands (sed, heredocs, mv,
// codemods), which never hit the Edit/Write tools — so shell-shaped tool
// payloads are scanned for source paths mentioned in the command and those
// files are checked after the command ran.
// Hooks must never break the agent loop: malformed payloads exit 0 silently.

const WRITE_TOOL = /write|edit|replace|apply|patch/i;
const SHELL_TOOL = /shell|bash|terminal|command|exec/i;
const MAX_REPORTED = 40;

function formatReport(header, findings) {
  const shown = findings.slice(0, MAX_REPORTED);
  const more = findings.length - shown.length;
  return `${header}\n\n${shown.join('\n')}${more > 0 ? `\n…and ${more} more finding(s).` : ''}`;
}

function isCheckableSource(path) {
  return SOURCE_FILE.test(path) && !path.includes('\n') && !path.includes('node_modules');
}

function collectSourcePaths(value, found = new Set()) {
  if (typeof value === 'string') {
    if (isCheckableSource(value) && existsSync(value)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectSourcePaths(item, found);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectSourcePaths(item, found);
  }
  return found;
}

// Path-shaped tokens ending in a source extension, resolved against the
// command's cwd. Existence filtering keeps false positives at zero.
function collectCommandPaths(command, cwd, found = new Set()) {
  if (typeof command !== 'string') return found;
  for (const match of command.matchAll(/[^\s'"`;|&()<>=]+\.(?:tsx?|jsx)\b/g)) {
    const token = match[0];
    if (!isCheckableSource(token)) continue;
    const path = resolve(cwd, token);
    if (existsSync(path)) found.add(path);
  }
  return found;
}

// Claude Code Stop hook: the per-edit hooks catch violations file by file,
// but the agent can still end a turn with violations introduced through
// uncovered paths (git operations, scripts writing files, moved code). The
// Stop gate re-runs the whole mechanical check plus the wiring doctor and
// refuses to let the turn end while findings remain. `stop_hook_active`
// marks a turn that is already continuing because of this gate — allow it
// through then, so an agent that cannot satisfy the gate never loops forever.
function stopGate(payload) {
  if (payload.stop_hook_active) process.exit(0);
  const target = process.cwd();

  const findings = [];
  for (const dir of ['src', 'app', 'lib']) {
    const abs = join(target, dir);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs)) findings.push(...fileFindings(file, target));
  }
  if (existsSync(join(target, 'package.json'))) {
    findings.push(...doctorFindings(target).map(({ id, message }) => `[${id}] ${message}`));
  }
  if (findings.length === 0) process.exit(0);

  console.error(
    formatReport(
      'solid2-kit — React/Solid 1.x patterns are still in the project; fix them before finishing:',
      findings,
    ),
  );
  process.exit(2);
}

function hook(agent) {
  if (agent !== 'claude' && agent !== 'cursor') {
    console.error('solid2-kit hook — expected agent: claude | cursor');
    process.exit(2);
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  if (!payload || typeof payload !== 'object') process.exit(0);

  if (agent === 'claude' && payload.hook_event_name === 'Stop') stopGate(payload);

  // afterFileEdit-style payloads carry file_path at the top level; tool-use
  // payloads carry the edited path(s) inside tool_input. Only write-shaped
  // and shell-shaped tools are gated, so reads/searches never are.
  const files = new Set();
  if (typeof payload.file_path === 'string') collectSourcePaths(payload.file_path, files);
  if (payload.tool_input !== undefined) {
    const toolName = typeof payload.tool_name === 'string' ? payload.tool_name : '';
    let toolInput = payload.tool_input;
    if (typeof toolInput === 'string') {
      try {
        toolInput = JSON.parse(toolInput);
      } catch {
        toolInput = undefined;
      }
    }
    if (toolName === '' || WRITE_TOOL.test(toolName)) {
      collectSourcePaths(toolInput, files);
    } else if (SHELL_TOOL.test(toolName)) {
      const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
      collectCommandPaths(toolInput?.command, cwd, files);
    }
  }
  if (files.size === 0) process.exit(0);

  const findings = [];
  for (const file of files) {
    try {
      findings.push(...fileFindings(file, process.cwd()));
    } catch {
      // File disappeared between the edit and the hook — nothing to check.
    }
  }
  if (findings.length === 0) process.exit(0);

  const report = formatReport(
    'solid2-kit check — React/Solid 1.x patterns in this edit; fix them now:',
    findings,
  );
  if (agent === 'claude') {
    console.error(report);
    process.exit(2);
  }
  console.log(JSON.stringify({ additional_context: report }));
  process.exit(0);
}

// --- doctor -----------------------------------------------------------------
// Project-config gate: `check` covers TSX sources, `doctor` covers the wiring
// around them — dependencies, tsconfig, and root config files — where agents
// also reach for React / Solid 1.x tooling (vite-plugin-solid,
// eslint-plugin-solid, jsxImportSource: "solid-js", ...).

const BANNED_DEPS = {
  react: 'React does not belong in a Solid 2.0 project.',
  'react-dom': 'React does not belong in a Solid 2.0 project.',
  next: 'Next.js does not belong in a Solid 2.0 project.',
  'vite-plugin-solid': 'Solid 1.x Vite plugin. Use @solidjs/vite-plugin.',
  'eslint-plugin-solid':
    'Built for Solid 1.x; its analyzer misreads Solid 2 idioms (two-phase createEffect, writable derivations, draft setters). Remove it — solid2-kit check carries the still-valid intents.',
  '@solidjs/start': 'SolidStart 1.x. Solid 2 start mode lives in @solidjs/vite-plugin (start: true).',
  'solid-start': 'SolidStart 0.x. Solid 2 start mode lives in @solidjs/vite-plugin (start: true).',
  'solid-app-router': 'Pre-1.0 router. Use @solidjs/router 2 (createRouter({ routes })).',
  vinxi: 'SolidStart 1.x toolchain. Solid 2 uses @solidjs/vite-plugin directly.',
};

const CONFIG_SOURCE = /\.(?:m|c)?[jt]s$/;

// Files installed by this kit that carry a version marker. When the kit
// dependency is updated but `sync` is not re-run, the installed guidance
// keeps teaching agents the older content — silent drift doctor can catch.
const GUIDANCE_FILES = ['.cursor/rules/solid-2.mdc', 'CLAUDE.md', 'AGENTS.md'];

function doctorFindings(target) {
  const findings = [];
  const report = (id, message) => findings.push({ id, message });

  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, message] of Object.entries(BANNED_DEPS)) {
    if (name in deps) report(`dep-${name.replace(/[@/]/g, '')}`, `package.json depends on "${name}". ${message}`);
  }
  const solidRange = deps['solid-js'];
  if (typeof solidRange === 'string' && /^[\s^~=v]*[01]\./.test(solidRange)) {
    report('solid-js-version', `package.json pins solid-js "${solidRange}" — this kit teaches Solid 2.x; upgrade to ^2.`);
  }

  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(target, entry.name);

    if (/^tsconfig.*\.json$/.test(entry.name)) {
      // tsconfig is JSONC; extract the two relevant keys with regexes.
      const content = readFileSync(path, 'utf8');
      const jsx = content.match(/"jsx"\s*:\s*"([^"]+)"/)?.[1];
      if (jsx && jsx !== 'preserve') {
        report('tsconfig-jsx', `${entry.name} sets "jsx": "${jsx}". Solid 2 compiles its own JSX: use "preserve".`);
      }
      const importSource = content.match(/"jsxImportSource"\s*:\s*"([^"]+)"/)?.[1];
      if (importSource && importSource !== '@solidjs/web') {
        report(
          'tsconfig-jsx-import-source',
          `${entry.name} sets "jsxImportSource": "${importSource}". Solid 2 JSX types live in "@solidjs/web".`,
        );
      }
      continue;
    }

    if (CONFIG_SOURCE.test(entry.name)) {
      const content = readFileSync(path, 'utf8');
      if (/['"]vite-plugin-solid['"]/.test(content)) {
        report('config-vite-plugin-solid', `${entry.name} references vite-plugin-solid (Solid 1.x). Import solid from "@solidjs/vite-plugin".`);
      }
      if (/jsxImportSource['"]?\s*[:=]\s*['"](?:solid-js|react)['"]/.test(content)) {
        report('config-jsx-import-source', `${entry.name} sets jsxImportSource to solid-js/react. Solid 2 uses "@solidjs/web".`);
      }
    }

    if (/^(?:\.eslintrc|eslint\.config\.)/.test(entry.name)) {
      const content = readFileSync(path, 'utf8');
      if (content.includes('eslint-plugin-solid')) {
        report('eslint-plugin-solid', `${entry.name} wires eslint-plugin-solid (Solid 1.x analyzer; false-positives on Solid 2 idioms). Remove it.`);
      }
    }
  }

  for (const guidance of GUIDANCE_FILES) {
    const path = join(target, guidance);
    if (!existsSync(path)) continue;
    const installed = readFileSync(path, 'utf8').match(/solid2-agent-kit v(\d[\w.-]*)/)?.[1];
    if (installed && installed !== VERSION) {
      report(
        'stale-guidance',
        `${guidance} was installed by solid2-agent-kit v${installed} but v${VERSION} is running — run \`solid2-kit sync\` so agents read current guidance.`,
      );
    }
  }

  return findings;
}

function doctor() {
  const target = resolve(flagValue('--target', '.'));
  if (!existsSync(join(target, 'package.json'))) {
    console.error(`solid2-kit doctor — no package.json at ${target} (use --target)`);
    process.exit(2);
  }

  const findings = doctorFindings(target);
  for (const { id, message } of findings) console.error(`[${id}] ${message}`);

  if (findings.length > 0) {
    console.error(`\nsolid2-kit doctor — ${findings.length} finding(s). Fix the project wiring above.`);
    process.exit(1);
  }
  console.log('solid2-kit doctor — OK (dependencies, tsconfig, root configs, and installed guidance look like Solid 2).');
}

// --- entry ------------------------------------------------------------------

switch (command) {
  case 'init':
  case 'sync':
    init();
    break;
  case 'check':
    check();
    break;
  case 'doctor':
    doctor();
    break;
  case 'hook':
    hook(args[1]);
    break;
  default:
    console.log(
      [
        `solid2-agent-kit v${VERSION}`,
        '',
        'Usage:',
        '  solid2-kit init  [--cursor] [--claude] [--no-hooks] [--target <dir>]  install/update guidance + edit hooks (default: both tools)',
        '  solid2-kit sync  [--cursor] [--claude] [--no-hooks] [--target <dir>]  alias of init (idempotent)',
        '  solid2-kit check [--dir <srcdir>] [--target <dir>] [files...]         mechanical React/Solid 1.x pattern gate (default dir: src)',
        '  solid2-kit doctor [--target <dir>]                                    project-wiring gate: deps, tsconfig, root configs',
        '  solid2-kit hook (claude|cursor)                                       edit-time gate for agent hooks (stdin: hook JSON payload)',
      ].join('\n'),
    );
    process.exit(command ? 2 : 0);
}
