// `hook`: the edit-time gate the agent hooks invoke (payload on stdin) —
// post-edit findings, the pre-execution guard, and the Stop gate.

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { SOURCE_FILE, fileFindings, walk } from './check.mjs';
import { BANNED_DEPS, doctorFindings } from './doctor.mjs';

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
// command's cwd. Existence filtering keeps false positives at zero. Two
// shapes need more than the literal token: glob patterns (`src/*.tsx` —
// the literal path never exists, so expand against the filesystem) and
// quoted paths containing spaces (invisible to the token scan, so quoted
// segments are tried as tokens of their own).
function globToRegExp(glob) {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0001')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*')
    .replace(/\u0001/g, '(?:.*/)?');
  return new RegExp(`^${body}$`);
}

function addCommandToken(token, cwd, found) {
  if (/[*?]/.test(token)) {
    // A glob token never ends in a literal extension when the wildcard sits
    // after it (`src/App.ts?`), so test the source shape with the wildcards
    // blanked to a placeholder character instead.
    if (!isCheckableSource(token.replace(/[*?]/g, 'x'))) return;
    const firstWild = token.search(/[*?]/);
    const slash = token.lastIndexOf('/', firstWild);
    const base = resolve(cwd, slash === -1 ? '.' : token.slice(0, slash));
    if (!existsSync(base)) return;
    const pattern = globToRegExp(token.replace(/^\.\//, ''));
    for (const file of walk(base)) {
      const candidate = token.startsWith('/') ? file : relative(cwd, file);
      if (pattern.test(candidate)) found.add(file);
    }
    return;
  }
  if (!isCheckableSource(token)) return;
  const path = resolve(cwd, token);
  if (existsSync(path)) found.add(path);
}

function collectCommandPaths(command, cwd, found = new Set()) {
  if (typeof command !== 'string') return found;
  for (const match of command.matchAll(/[^\s'"`;|&()<>=]+\.(?:tsx?|jsx)\b[*?]?/g)) {
    addCommandToken(match[0], cwd, found);
  }
  for (const quoted of command.matchAll(/'([^'\n]+)'|"([^"\n]+)"/g)) {
    addCommandToken(quoted[1] ?? quoted[2], cwd, found);
  }
  return found;
}

// --- pre-execution guard (self-defense + proactive denial) -------------------
// Agents that keep getting blocked by a gate tend to conclude the gate is
// wrong and edit or delete it. Pre-execution hooks (Claude PreToolUse,
// Cursor preToolUse / beforeShellExecution) can deny a tool call before it
// runs, so this guard refuses:
//   - edits/deletes of kit-owned guardrail files (rules, skill, commands,
//     the kit itself under node_modules),
//   - edits that would remove the kit's markers from hook configs or the
//     AGENTS.md / CLAUDE.md managed blocks,
//   - shell rewrites of those files (sed/rm/redirects — uninspectable),
//   - installing dependencies doctor would flag anyway (react,
//     vite-plugin-solid, eslint-plugin-solid, SolidStart, ...).
// Everything else is allowed; this gate never inspects file *content* being
// written (that is the post-edit hook's job).

const GUARDRAIL_PATH =
  /\.cursor\/rules\/solid-2\.mdc|(?:\.cursor|\.claude)\/skills\/solid-2|(?:\.cursor|\.claude)\/commands\/solid2-review\.md|node_modules\/solid2-agent-kit\//;
const MARKER_FILE = /(?:\.claude\/settings\.json|\.cursor\/hooks\.json|AGENTS\.md|CLAUDE\.md)$/;
const KIT_MARKER = 'solid2-agent-kit';
// Write-capable shell shapes: the classic file verbs, a redirect, or an
// interpreter running inline code (`node -e`, `python -c`, `deno eval`, …).
// An interpreter is guaranteed to exist wherever this kit runs, so a verb
// list alone would leave the most available rewrite tool uninspected.
const SHELL_WRITE =
  /\b(?:rm|mv|cp|sed|tee|truncate|unlink|chmod|dd|install|rsync|ed|perl|python[\d.]*)\b|\b[gm]?awk\b[^;&|]*-i\s+inplace\b|>>?/;
const SHELL_EVAL =
  /\b(?:node|bun|deno|ruby|php|perl|python[\d.]*)\b[^;&|]*(?:\s-e\b|\s-c\b|--eval\b|\beval\b)/;

const TAMPER_MESSAGE =
  'solid2-agent-kit guardrail: this file is kit-managed Solid 2.0 guidance/enforcement. Do not edit, weaken, or delete it — fix the flagged code instead. Kit files update via `solid2-kit sync`. If you believe the guardrail itself is wrong, or the user explicitly wants it removed, stop and tell the user.';

// A protected path can be hidden from a literal regex test: split across
// simple same-command variable assignments (`P=.claude/settings.json;
// sed -i '' $P`) or padded with redundant separators (`.claude//x`,
// `./.claude/x`). Expand the simple assignments and collapse the
// separators so the path checks see the path the shell will actually use.
// Only the expanded copy is tested — the command itself is never altered.
function expandShellVars(command) {
  const vars = new Map();
  for (const match of command.matchAll(
    /(?:^|[\n;&|(]\s*)([A-Za-z_][A-Za-z0-9_]*)=(?:'([^']*)'|"([^"]*)"|([^\s;&|]+))/g,
  )) {
    vars.set(match[1], match[2] ?? match[3] ?? match[4]);
  }
  // A for-loop header binds its variable to the list (`for f in
  // .claude/settings.json; do rm $f; done`) — record the list as the
  // value so uses of the variable expand to the paths it can carry.
  for (const match of command.matchAll(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([^;&|]+)/g)) {
    vars.set(match[1], match[2].trim());
  }
  let expanded = command;
  for (const name of [...vars.keys()].sort((a, b) => b.length - a.length)) {
    expanded = expanded.replace(new RegExp(`\\$\\{${name}\\}|\\$${name}\\b`, 'g'), vars.get(name));
  }
  // Backslash-escaped separators in an unquoted path name the same file
  // (`rm .claude\/settings.json`), so unescape them before testing.
  return expanded
    .replace(/(^|[\s'"])\.\//g, '$1')
    .replace(/\/{2,}/g, '/')
    .replace(/\\([/.])/g, '$1');
}

// Split a command into its sequence segments on &&, || and ; outside
// quotes, so a separator inside a quoted string (a sed script, an
// inline-eval body) never cuts a segment in half. Pipelines stay whole:
// data flows through a pipeline, so a path mentioned on the left of a `|`
// still reaches the write verb on its right (`… | xargs rm`). Backslash
// escapes are honored everywhere except inside single quotes (where the
// shell treats a backslash literally), so an escaped quote cannot fake
// the end of a quoted string.
function splitSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (ch === '\\' && quote !== "'") {
      current += ch + (command[i + 1] ?? '');
      i += 1;
    } else if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
    } else if (ch === ';') {
      segments.push(current);
      current = '';
    } else if (ch === '&' && command[i + 1] === '&') {
      segments.push(current);
      current = '';
      i += 1;
    } else if (ch === '|' && command[i + 1] === '|') {
      segments.push(current);
      current = '';
      i += 1;
    } else {
      current += ch;
    }
  }
  segments.push(current);
  return segments;
}

// Package-manager flags that take a separate value; the install verb can
// sit behind any number of them (`npm --prefix . install react`), so the
// verb search must skip flag values instead of expecting the verb early.
const PM_VALUE_FLAGS = new Set([
  '--prefix',
  '--workspace',
  '--cwd',
  '-C',
  '--dir',
  '--registry',
  '--userconfig',
  '--user-config',
  '--python',
  '--global-folder',
  '--modules-dir',
  '--store-dir',
  '--cache',
  '--loglevel',
  '--filter',
]);

function bannedInstall(command) {
  // Tokenize loosely: separators are spaced first so a glued `react&&echo`
  // or `react;` still yields a clean `react` token, and surrounding
  // quotes / a leading subshell paren are punctuation, not part of a word.
  const tokens = command
    .replace(/&&|\|\||;/g, ' $& ')
    .split(/\s+/)
    .map((raw) => raw.replace(/^[('"]+/, '').replace(/['")]+$/, ''))
    .filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    if (!/^(?:npm|pnpm|yarn|bun)$/.test(tokens[i])) continue;
    // Find this invocation's verb: the first bare token after the manager
    // name, skipping flags and the values of flags that take one.
    let verbIndex = -1;
    for (let j = i + 1; j < tokens.length; j += 1) {
      const token = tokens[j];
      if (token === '&&' || token === '||' || token === ';' || token === '|') break;
      if (token.startsWith('-')) {
        if (!token.includes('=') && PM_VALUE_FLAGS.has(token)) j += 1;
        continue;
      }
      verbIndex = j;
      break;
    }
    if (verbIndex === -1) continue;
    let verb = tokens[verbIndex];
    // yarn classic puts a `global` modifier before the verb
    // (`yarn global add react`) — step over it, and over any flags (and
    // their values) between it and the real verb.
    if (tokens[i] === 'yarn' && verb === 'global') {
      let next = -1;
      for (let j = verbIndex + 1; j < tokens.length; j += 1) {
        const token = tokens[j];
        if (token === '&&' || token === '||' || token === ';' || token === '|') break;
        if (token.startsWith('-')) {
          if (!token.includes('=') && PM_VALUE_FLAGS.has(token)) j += 1;
          continue;
        }
        next = j;
        break;
      }
      if (next === -1) continue;
      verbIndex = next;
      verb = tokens[verbIndex];
    }
    if (verb !== 'install' && verb !== 'add' && verb !== 'i') continue;
    // Only the arguments of this invocation count — a banned name that is
    // merely mentioned elsewhere in the command is not an install.
    for (let k = verbIndex + 1; k < tokens.length; k += 1) {
      const token = tokens[k];
      if (token === '&&' || token === '||' || token === ';' || token === '|') break;
      const name = token.replace(/(?!^)@.*$/, '');
      if (name in BANNED_DEPS) return name;
    }
  }
  return null;
}

function preToolGate(agent, payload) {
  const deny = (agentMessage) => {
    if (agent === 'claude') {
      console.error(agentMessage);
      process.exit(2);
    }
    console.log(
      JSON.stringify({
        permission: 'deny',
        agent_message: agentMessage,
        user_message: 'solid2-agent-kit guardrail blocked this action.',
      }),
    );
    process.exit(0);
  };

  let toolInput = payload.tool_input;
  if (typeof toolInput === 'string') {
    try {
      toolInput = JSON.parse(toolInput);
    } catch {
      toolInput = undefined;
    }
  }
  const toolName = typeof payload.tool_name === 'string' ? payload.tool_name : '';

  // Shell commands: beforeShellExecution carries `command` at the top level,
  // PreToolUse(Bash) inside tool_input.
  const command =
    typeof payload.command === 'string'
      ? payload.command
      : SHELL_TOOL.test(toolName) && typeof toolInput?.command === 'string'
        ? toolInput.command
        : null;
  if (command !== null) {
    const banned = bannedInstall(command);
    if (banned) {
      deny(
        `solid2-agent-kit guardrail: do not install "${banned}". ${BANNED_DEPS[banned]} (\`solid2-kit doctor\` fails on it.)`,
      );
    }
    // Judge each command segment on its own: a write verb in one segment
    // must not condemn a protected path that another segment only reads
    // (`npm install lodash && cat .claude/settings.json` is fine; the same
    // path under a write verb or an inline-eval interpreter is not).
    // Variable expansion uses the whole command, since an assignment can
    // sit in an earlier segment than its use.
    const expanded = expandShellVars(command);
    for (const segment of splitSegments(expanded)) {
      if (!SHELL_WRITE.test(segment) && !SHELL_EVAL.test(segment)) continue;
      if (GUARDRAIL_PATH.test(segment)) deny(TAMPER_MESSAGE);
      if (/(?:\.claude\/settings\.json|\.cursor\/hooks\.json)/.test(segment)) {
        deny(
          'solid2-agent-kit guardrail: rewriting hook configs through the shell cannot be verified. Use the Edit tool (keeping the solid2-agent-kit hook entries), or ask the user.',
        );
      }
    }
    process.exit(0);
  }

  if (!WRITE_TOOL.test(toolName)) process.exit(0);
  const filePath = typeof toolInput?.file_path === 'string' ? toolInput.file_path : toolInput?.path;
  if (typeof filePath !== 'string') process.exit(0);

  if (GUARDRAIL_PATH.test(filePath)) deny(TAMPER_MESSAGE);

  if (MARKER_FILE.test(filePath)) {
    // Editing these files is fine (users add their own hooks/sections through
    // agents) as long as the kit's entries/managed blocks survive the edit.
    const removalMessage = `solid2-agent-kit guardrail: this edit removes the ${KIT_MARKER} entries/managed block from ${filePath}. Keep them intact; run \`solid2-kit sync\` to update them. If the user explicitly wants the kit removed, stop and tell the user to do it.`;
    if (typeof toolInput.content === 'string') {
      let existing = '';
      try {
        existing = readFileSync(resolve(typeof payload.cwd === 'string' ? payload.cwd : process.cwd(), filePath), 'utf8');
      } catch {
        // New file — nothing to preserve.
      }
      if (existing.includes(KIT_MARKER) && !toolInput.content.includes(KIT_MARKER)) deny(removalMessage);
    } else if (
      typeof toolInput.old_string === 'string' &&
      toolInput.old_string.includes(KIT_MARKER) &&
      !String(toolInput.new_string ?? '').includes(KIT_MARKER)
    ) {
      deny(removalMessage);
    }
  }

  process.exit(0);
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

export function hook(agent) {
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

  const event = typeof payload.hook_event_name === 'string' ? payload.hook_event_name : '';
  if (agent === 'claude' && event === 'Stop') stopGate(payload);
  // Pre-execution events (PreToolUse / preToolUse / beforeShellExecution)
  // only run the guard — never the content check (the file has not been
  // written yet, so checking would block edits based on pre-edit state).
  if (/^(?:pre|before)/i.test(event)) preToolGate(agent, payload);

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
