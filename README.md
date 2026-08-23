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
| Always-applied hard rules | `.cursor/rules/solid-2.mdc` (glob-attached to `*.tsx`/`*.jsx`) | managed block in `CLAUDE.md` | 17 hard rules + banned Solid 1.x API table + eslint-plugin-solid lint-heritage table. Injected without the agent having to decide to read anything |
| Agent skill | `.cursor/skills/solid-2/` | `.claude/skills/solid-2/` | Execution-model primer, decision tables (state placement, effect-or-not), canonical patterns verified against official docs, review checklist, official-doc URL index |
| Shared agent context | managed block in `AGENTS.md` | same (Claude Code users can reference it from `CLAUDE.md`) | Core principles and pointers, always in context |
| Mechanical gate | `solid2-kit check` | same | Whole-file regex guard over `src/**/*.{ts,tsx}`: fails on props destructuring (including multi-line signatures), React imports/hooks/JSX props, Solid 1.x imports/APIs/components, `Context.Provider`, camelCase style keys, `key` props, and `value()!` hand-narrowing (use `<Show>`) |

Managed blocks are delimited with `<!-- solid2-agent-kit:*:start/end -->` markers; everything
outside them is yours. Kit-owned files (`solid-2.mdc`, the skill directories) are overwritten
on sync.

## Usage

```sh
# install guidance for both Cursor and Claude Code (default)
npx solid2-agent-kit init          # or: bunx solid2-agent-kit init

# one tool only
npx solid2-agent-kit init --cursor
npx solid2-agent-kit init --claude

# run the mechanical pattern gate (default source dir: src)
npx solid2-agent-kit check
npx solid2-agent-kit check --dir app

# pull in kit updates later (idempotent; replaces managed blocks and kit-owned files)
npx solid2-agent-kit@latest sync
```

Until the package is published to npm, run it straight from GitHub:

```sh
npx github:lightsound/solid2-agent-kit init
```

So that agents (and CI) can run the gate by name, add the kit as a devDependency and wire a
script in the consuming project's `package.json`:

```json
{
  "devDependencies": { "solid2-agent-kit": "github:lightsound/solid2-agent-kit" },
  "scripts": { "lint:solid": "solid2-agent-kit check" }
}
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
names.

Note: the canonical docs site https://v2.solidjs.com/ sits behind bot protection, so the kit
(and the guidance it installs) points agents at the official markdown mirror
`https://v2-rebuild--solid-docs-v2.netlify.app` (`llms.txt` index; every page served as
markdown with an `.md` suffix).

## Layout

```
bin/solid2-kit.mjs                 CLI: init / sync / check
files/shared/rules-body.md         hard rules (rendered into .mdc and CLAUDE.md)
files/shared/agents-section.md     AGENTS.md managed-block content
files/skills/solid-2/              SKILL.md + references/official-docs.md
scripts/check-docs-drift.mjs       weekly docs cross-check
```

## License

MIT
