# solid2-agent-kit

Teach AI coding agents to write correct **Solid 2.0** — not React, and not Solid 1.x.

LLMs are heavily biased toward React when writing TSX, and their Solid knowledge is mostly
Solid 1.x, which is incompatible with Solid 2.0. This kit installs layered guardrails into a
project so agents stop destructuring props, reaching for `useEffect`/`createResource`, or
writing `className` — and start writing idiomatic Solid 2.0.

Supported agents: **Cursor** and **Claude Code**.

## What it installs

| Layer | Cursor | Claude Code | Role |
|---|---|---|---|
| Always-applied hard rules | `.cursor/rules/solid-2.mdc` (glob-attached to `*.tsx`/`*.jsx`) | managed block in `CLAUDE.md` | 23 hard rules + banned Solid 1.x API table + eslint-plugin-solid lint-heritage table. Injected without the agent having to decide to read anything |
| Agent skill | `.cursor/skills/solid-2/` | `.claude/skills/solid-2/` | Execution-model primer, decision tables, canonical patterns, a “still runs / write the other form” table, review checklist, official-doc URL index |
| Shared agent context | managed block in `AGENTS.md` | same (Claude Code users can reference it from `CLAUDE.md`) | Core principles and pointers, always in context |
| Mechanical gate | `solid2-kit check` | same | Comment-stripped regex guard over `src/**/*.{ts,tsx,jsx}` (or explicit `[files...]`): fails on props destructuring (including multi-line signatures), `{ ...props }` rest copies, `{list().map(...)}` in JSX, React imports/hooks/JSX props/`React.lazy`/`useOptimistic`, Solid 1.x imports/APIs/components/JSX namespaces, `vite-plugin-solid`, old-router `<Route>`/`<A>`/`<HashRouter>`/`<FileRoutes>`, `MetaProvider`, `Context.Provider`, camelCase style keys, `key` props, `value()!` hand-narrowing, hand-rolled loading signals, `=== undefined` readiness branches, SolidStart leftovers (`@solidjs/start`, `createAsync`, `useSubmission`, `"use client"`), Next.js imports, and `render(<App />)` (pass a function) |
| Edit-time hook | `postToolUse` entry in `.cursor/hooks.json` | `PostToolUse` entry in `.claude/settings.json` (matcher includes `Bash`) | Runs the mechanical gate automatically on **every agent file edit — including edits made through shell commands** (sed, heredocs, codemods; source paths mentioned in the command are checked after it ran) — and feeds findings straight back into the conversation (Cursor: `additional_context`; Claude Code: stderr + exit 2), so enforcement does not depend on the agent remembering to run `check`. Wired only when the kit is a local devDependency; opt out with `--no-hooks` |
| Turn-end gate | — | `Stop` entry in `.claude/settings.json` | Whole-project `check` + `doctor` when the agent tries to end its turn: with findings in place the stop is blocked (exit 2) and the findings are fed back, so a turn cannot finish with React/Solid 1.x patterns left behind. Loop-safe via `stop_hook_active` (one forced continuation, never an infinite loop) |
| Pre-execution guard | `preToolUse` + `beforeShellExecution` entries in `.cursor/hooks.json` | `PreToolUse` entry in `.claude/settings.json` | Denies actions **before they run**: edits/deletes of kit-owned guardrail files (an agent blocked by a gate will try to remove the gate), edits that would strip the kit's hook entries or managed blocks, uninspectable shell rewrites of those files, and `npm/pnpm/yarn/bun install` of banned dependencies (`react`, `vite-plugin-solid`, `eslint-plugin-solid`, SolidStart, ...) — caught proactively instead of post-hoc by `doctor` |
| Project-wiring gate | `solid2-kit doctor` | same | Config drift the source gate cannot see: React / `vite-plugin-solid` / `eslint-plugin-solid` / SolidStart deps in `package.json`, a 1.x `solid-js` range, `jsx` ≠ `preserve` or `jsxImportSource` ≠ `@solidjs/web` in tsconfig, Solid 1.x wiring in root config files, and stale installed guidance (kit updated but `sync` not re-run) |
| Review command | `.cursor/commands/solid2-review.md` | `.claude/commands/solid2-review.md` | `/solid2-review` — on-demand deep review: runs both gates, then walks the diff against the skill checklist targeting the semantic failure classes regexes cannot see (post-`await` reads, effect misuse, unkeyed server rows, boundary placement, context snapshots) |

Managed blocks are delimited with `<!-- solid2-agent-kit:*:start/end -->` markers; everything
outside them is yours. Kit-owned files (`solid-2.mdc`, the skill directories) are overwritten
on sync.

## Usage

GitHub is the canonical distribution channel (the kit is intentionally not published to
npm; consumers pin a commit through their lockfile):

```sh
# install guidance for both Cursor and Claude Code (default)
npx github:lightsound/solid2-agent-kit init

# one tool only
npx github:lightsound/solid2-agent-kit init --cursor
npx github:lightsound/solid2-agent-kit init --claude

# run the mechanical pattern gate (default source dir: src; or name files)
npx github:lightsound/solid2-agent-kit check
npx github:lightsound/solid2-agent-kit check --dir app
npx github:lightsound/solid2-agent-kit check src/App.tsx

# check the project wiring (deps, tsconfig, root configs)
npx github:lightsound/solid2-agent-kit doctor

# pull in kit updates later (idempotent; replaces managed blocks, kit-owned
# files, and hook entries)
npx github:lightsound/solid2-agent-kit sync
```

So that agents (and CI) can run the gate by name, add the kit as a devDependency and wire a
script in the consuming project's `package.json` (with a local install, `npx`/`bunx`
resolve the project-local bin, so the bare name is safe there):

```json
{
  "devDependencies": { "solid2-agent-kit": "github:lightsound/solid2-agent-kit" },
  "scripts": { "lint:solid": "solid2-agent-kit check" }
}
```

Update later with `bun update solid2-agent-kit` (or the npm/pnpm equivalent) followed by
`npx solid2-agent-kit sync`. Outside a project that has the kit installed, always use the
`npx github:...` form — the bare package name is not claimed on the npm registry.

## Edit-time hooks (automatic enforcement)

The rules and skill teach; `check` verifies — but only if someone runs it. The hook layer
closes that gap: `init`/`sync` wire `solid2-kit hook` into both agents' hook systems, so the
mechanical gate runs on **every file the agent edits** and violations come back as feedback
the agent must act on, in the same turn it introduced them:

- **Cursor** — a `postToolUse` entry in `.cursor/hooks.json`; findings are injected into the
  conversation as `additional_context` right after the tool result.
- **Claude Code** — a `PostToolUse` entry in `.claude/settings.json` (matcher
  `Edit|MultiEdit|Write|Bash`); findings go to stderr with exit 2, which Claude Code feeds
  back to the model as a correction prompt.

Agents also edit files *through the shell* (sed, heredocs, `mv`, codemod scripts), which
never hits the Edit/Write tools — so shell-shaped tool payloads are scanned for source
paths mentioned in the command, and those files are checked after the command ran.

Claude Code additionally gets a **turn-end gate**: a `Stop` hook re-runs the whole
mechanical check (over `src`/`app`/`lib`) plus `doctor` when the agent tries to finish its
turn, and blocks the stop while findings remain. `stop_hook_active` is honored, so an agent
that cannot satisfy the gate is forced to continue exactly once, never looped forever.
(Cursor's `stop` hook cannot feed back to the agent, so there the last line of defense is
the always-attached rules plus CI.)

Both agents also get a **pre-execution guard** (Claude: `PreToolUse`; Cursor: `preToolUse`
and `beforeShellExecution`). A blocked agent's classic next move is to decide the gate
itself is wrong — edit the rules file, delete the skill, or strip the hook entries. The
guard denies, before the tool call runs: writes to kit-owned files (rules `.mdc`, skill
directories, review commands, the kit under `node_modules`); edits to `.cursor/hooks.json`
/ `.claude/settings.json` / `AGENTS.md` / `CLAUDE.md` that would remove the kit's entries
or managed blocks (marker-preserving edits pass — agents can still add the user's own
hooks and sections); shell rewrites of those files (`sed`/`rm`/redirects — uninspectable,
so the deny message redirects to the Edit tool); and package-manager installs of
dependencies `doctor` bans (exact token match, so `react` is denied but `react-aria` is
not). The deny message always tells the agent what to do instead — fix the flagged code,
run `solid2-kit sync`, or stop and ask the user. Pre-execution events never run the
content check itself: fixing a currently-bad file is always allowed.

When the kit is installed as a devDependency, `init` also wires a `lint:solid` script
(`solid2-kit check && solid2-kit doctor`) into the project's `package.json` (only if the
script does not already exist), so agents and CI can run both gates by name.

The hook command is `node node_modules/solid2-agent-kit/bin/solid2-kit.mjs hook <agent>`,
so it only works when the kit is installed as a devDependency (see above); `init` skips the
wiring and prints a note otherwise. Merging is idempotent — kit entries are refreshed in
place on `sync`, user entries are preserved. Opt out with `init --no-hooks`. Hooks never
break the agent loop: clean edits, read tools, and malformed payloads exit silently, and
reports are capped at 40 findings.

Note on gate precision: `check` (and therefore the hooks) matches against
**comment-stripped** source, so prose like `// migrated off createResource` never trips
the gate, while string checks (`"use client"`) still work.

## CI for consuming projects

Run both gates on every PR so nothing an agent (or human) merges can reintroduce React or
Solid 1.x patterns:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 22 }
- run: npm ci
- run: npx solid2-agent-kit check && npx solid2-agent-kit doctor
```

## Why not eslint-plugin-solid?

`eslint-plugin-solid` was built for Solid 1.x. Its analyzer predates the Solid 2 model and
flags correct Solid 2 idioms — two-phase `createEffect(compute, apply)`, writable derivations
(`createSignal(fn)`), draft store setters — steering agents back toward 1.x patterns. This
kit carries over the plugin's still-valid intents (`no-destructure`,
`components-return-once`, `reactivity`, `prefer-for`, `prefer-show`, `no-innerhtml`,
`style-prop`, ...) as documented rules plus a regex gate, without the 1.x false positives.

## Docs-drift CI

Solid 2.0 is young and its docs move. A weekly GitHub Actions job
(`.github/workflows/docs-drift.yml`) fetches the official docs corpus
([llms-full.txt](https://v2-rebuild--solid-docs-v2.netlify.app/llms-full.txt)) and verifies
that every API the kit recommends still exists: `create*` primitives are auto-extracted from
the kit content, the rest come from an explicit list in `scripts/check-docs-drift.mjs`.
Matching requires code-like contexts (backticked, import/JSX position, or a call), so
common-word APIs such as `merge` or `action` cannot pass on prose alone. If Solid renames or
removes an API, the job fails and the kit content gets fixed before it teaches agents stale
names. The same workflow runs `tests/check.test.mjs` so the mechanical gate's new patterns
keep matching.

Note: the canonical docs site https://v2.solidjs.com/ sits behind bot protection, so the kit
(and the guidance it installs) points agents at the official markdown mirror
`https://v2-rebuild--solid-docs-v2.netlify.app` (`llms.txt` index; every page served as
markdown with an `.md` suffix).

## Layout

```
bin/solid2-kit.mjs                 CLI: init / sync / check / doctor / hook
files/shared/rules-body.md         hard rules (rendered into .mdc and CLAUDE.md)
files/shared/agents-section.md     AGENTS.md managed-block content
files/skills/solid-2/              SKILL.md + references/official-docs.md
files/commands/solid2-review.md    /solid2-review command (Cursor + Claude Code)
scripts/check-docs-drift.mjs       weekly docs cross-check
tests/                             check/doctor fixtures + hook and init-merge tests (`npm test`)
```

## License

MIT
