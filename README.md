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
| Mechanical gate | `solid2-kit check` | same | Whole-file regex guard over `src/**/*.{ts,tsx}` (or explicit `[files...]`): fails on props destructuring (including multi-line signatures), `{ ...props }` rest copies, `{list().map(...)}` in JSX, React imports/hooks/JSX props/`React.lazy`/`useOptimistic`, Solid 1.x imports/APIs/components/JSX namespaces, `vite-plugin-solid`, old-router `<Route>`/`<A>`/`<HashRouter>`/`<FileRoutes>`, `MetaProvider`, `Context.Provider`, camelCase style keys, `key` props, `value()!` hand-narrowing, hand-rolled loading signals, `=== undefined` readiness branches, SolidStart leftovers (`@solidjs/start`, `createAsync`, `useSubmission`, `"use client"`), Next.js imports, and `render(<App />)` (pass a function) |
| Edit-time hook | `postToolUse` entry in `.cursor/hooks.json` | `PostToolUse` entry in `.claude/settings.json` | Runs the mechanical gate automatically on **every agent file edit** and feeds findings straight back into the conversation (Cursor: `additional_context`; Claude Code: stderr + exit 2), so enforcement does not depend on the agent remembering to run `check`. Wired only when the kit is a local devDependency; opt out with `--no-hooks` |
| Project-wiring gate | `solid2-kit doctor` | same | Config drift the source gate cannot see: React / `vite-plugin-solid` / `eslint-plugin-solid` / SolidStart deps in `package.json`, a 1.x `solid-js` range, `jsx` ≠ `preserve` or `jsxImportSource` ≠ `@solidjs/web` in tsconfig, and Solid 1.x wiring in root config files |

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
  conversation as `additional_context` right after the write tool result.
- **Claude Code** — a `PostToolUse` entry in `.claude/settings.json` (matcher
  `Edit|MultiEdit|Write`); findings go to stderr with exit 2, which Claude Code feeds back
  to the model as a correction prompt.

The hook command is `node node_modules/solid2-agent-kit/bin/solid2-kit.mjs hook <agent>`,
so it only works when the kit is installed as a devDependency (see above); `init` skips the
wiring and prints a note otherwise. Merging is idempotent and preserves everything else in
those JSON files. Opt out with `init --no-hooks`. Hooks never block the agent loop: clean
edits, non-write tools, and malformed payloads exit silently.

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
scripts/check-docs-drift.mjs       weekly docs cross-check
tests/                             check/doctor fixtures + hook and init-merge tests (`npm test`)
```

## License

MIT
