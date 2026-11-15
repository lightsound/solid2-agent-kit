# solid2-agent-kit — project context

> **Context note (2026-11-15):** this INFO.md was written for the
> November 2026 deepsec audit run (executed by Muse on a snapshot
> of `main` @ `0c301ca`) and was carried into this repository
> unchanged except for this note. It describes the codebase as of
> that snapshot; update it when the architecture moves.


## What this is

solid2-agent-kit (v0.26.0) is a zero-runtime-dependency Node.js CLI (plain .mjs,
Node >= 18) that installs guardrails into *other* projects so AI coding agents
(Cursor, Claude Code) write correct Solid 2.0 instead of React / Solid 1.x.
It is distributed via GitHub (`npx github:lightsound/solid2-agent-kit`) and npm.

## Layout

- `bin/solid2-kit.mjs` — CLI entry (dispatcher only). Subcommands: init, sync,
  check, doctor, context, hook.
- `bin/init.mjs` — writes kit-owned files (rules, skill dirs) and managed
  blocks into a target project's AGENTS.md / CLAUDE.md / .cursor config /
  .claude/settings.json, and wires agent hooks.
- `bin/check.mjs`, `bin/scanners.mjs` — regex-based pattern gate over target
  project source files (comment-stripped source scanning).
- `bin/doctor.mjs` — checks target project wiring (package.json deps,
  tsconfig, root configs) against `bin/baseline.mjs` version pins.
- `bin/hook.mjs` — agent hook handlers (PostToolUse / PreToolUse / Stop).
  These run automatically inside the *user's* agent sessions with the user's
  privileges: they inspect tool calls (including Bash commands) after/before
  execution, deny edits to kit-owned guardrail files, deny installs of banned
  packages, and can block turn end (exit 2) with findings fed back.
- `bin/context.mjs` — prints agent context material.
- `scripts/check-upstream.mjs`, `scripts/upstream-probes/` — maintainer-side
  tooling that probes upstream Solid packages; may fetch from the network.
- `files/` — payload files copied into target projects (rules, skills,
  commands).
- `tests/` — node test scripts run via `npm test`.

## Trust boundaries that matter for review

- The kit writes into a target project chosen by the user running it; the
  interesting questions are path handling (symlinks, `..`, absolute paths),
  whether managed-block replacement can clobber user content outside the
  markers, and whether hook wiring can be tricked.
- `bin/hook.mjs` parses Bash command strings from agent tool calls to decide
  what a command touched — shell-parsing bypasses (quoting, subshells,
  indirection) are in scope, because the hook is a *guardrail against the
  agent itself*: a bypass means the agent can remove the guardrails.
- Hook handlers consume JSON on stdin from the agent host; malformed or
  adversarial input handling matters (fail-open vs fail-closed).
- There is no server, no database, no auth, and no user accounts. Do not
  report web-framework vulnerability classes that presuppose an HTTP server.
- Dependencies: none at runtime. Supply-chain surface is the distribution
  channel (npx github / npm) rather than a dependency tree.
