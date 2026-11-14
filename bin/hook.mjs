// `hook`: the edit-time gate the agent hooks invoke (payload on stdin) —
// post-edit findings, the pre-execution guard, and the Stop gate.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
const SHELL_WRITE = /\b(?:rm|mv|cp|sed|tee|truncate|unlink|chmod|perl|python[\d.]*)\b|>>?/;
const INSTALL_CMD = /\b(?:npm|pnpm|yarn|bun)\s+(?:-\S+\s+)*(?:install|add|i)\b/;

const TAMPER_MESSAGE =
  'solid2-agent-kit guardrail: this file is kit-managed Solid 2.0 guidance/enforcement. Do not edit, weaken, or delete it — fix the flagged code instead. Kit files update via `solid2-kit sync`. If you believe the guardrail itself is wrong, or the user explicitly wants it removed, stop and tell the user.';

function bannedInstall(command) {
  if (!INSTALL_CMD.test(command)) return null;
  for (const raw of command.split(/\s+/)) {
    const token = raw.replace(/^['"]|['"]$/g, '');
    const name = token.replace(/(?!^)@.*$/, '');
    if (name in BANNED_DEPS) return name;
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
    if (SHELL_WRITE.test(command)) {
      if (GUARDRAIL_PATH.test(command)) deny(TAMPER_MESSAGE);
      if (/(?:\.claude\/settings\.json|\.cursor\/hooks\.json)/.test(command)) {
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
