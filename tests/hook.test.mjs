#!/usr/bin/env node
// Tests for `solid2-kit hook (claude|cursor)` — the edit-time gate wired into
// agent hook systems. Verifies each agent's feedback channel and that
// non-write payloads and malformed input never disturb the agent loop.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const kit = join(root, 'bin/solid2-kit.mjs');
const badFile = join(root, 'tests/fixtures/violations/bad.tsx');
const cleanFile = join(root, 'tests/fixtures/clean/app.tsx');

function runHook(agent, payload, options = {}) {
  return spawnSync(process.execPath, [kit, 'hook', agent], {
    encoding: 'utf8',
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    ...options,
  });
}

function fail(message, result) {
  console.error(message);
  if (result?.stdout) console.error(result.stdout);
  if (result?.stderr) console.error(result.stderr);
  process.exit(1);
}

// Claude Code PostToolUse: findings → stderr + exit 2 (fed back to Claude).
const claudeBad = runHook('claude', { tool_name: 'Edit', tool_input: { file_path: badFile } });
if (claudeBad.status !== 2 || !claudeBad.stderr.includes('[react-import]')) {
  fail('expected `hook claude` to exit 2 with findings on stderr for a bad edit', claudeBad);
}

const claudeClean = runHook('claude', { tool_name: 'Write', tool_input: { file_path: cleanFile } });
if (claudeClean.status !== 0 || claudeClean.stderr.trim() !== '') {
  fail('expected `hook claude` to exit 0 silently for a clean edit', claudeClean);
}

// Cursor postToolUse: findings → {"additional_context"} JSON on stdout, exit 0.
const cursorBad = runHook('cursor', {
  hook_event_name: 'postToolUse',
  tool_name: 'Write',
  tool_input: { file_path: badFile },
});
if (cursorBad.status !== 0) fail('expected `hook cursor` to exit 0', cursorBad);
const context = JSON.parse(cursorBad.stdout).additional_context;
if (!context || !context.includes('[react-import]')) {
  fail('expected `hook cursor` to emit findings as additional_context', cursorBad);
}

// Read-shaped tools are never gated, even when their input mentions a bad file.
const cursorRead = runHook('cursor', { tool_name: 'Read', tool_input: { file_path: badFile } });
if (cursorRead.status !== 0 || cursorRead.stdout.trim() !== '') {
  fail('expected `hook cursor` to ignore read-shaped tools', cursorRead);
}

// Malformed payloads must never break the agent loop.
const malformed = runHook('claude', 'not json {');
if (malformed.status !== 0) fail('expected `hook claude` to exit 0 on malformed stdin', malformed);

// Shell edits (sed, heredocs, scripts) bypass the Edit/Write tools; source
// paths mentioned in the command are checked after the command ran.
const claudeShell = runHook('claude', {
  tool_name: 'Bash',
  tool_input: { command: "sed -i 's/foo/bar/' tests/fixtures/violations/bad.tsx" },
  cwd: root,
});
if (claudeShell.status !== 2 || !claudeShell.stderr.includes('[react-import]')) {
  fail('expected `hook claude` to gate a shell command touching a bad source file', claudeShell);
}

const cursorShell = runHook('cursor', {
  hook_event_name: 'postToolUse',
  tool_name: 'Shell',
  tool_input: { command: 'printf x >> tests/fixtures/violations/legacy.jsx' },
  cwd: root,
});
const shellContext = JSON.parse(cursorShell.stdout || '{}').additional_context;
if (cursorShell.status !== 0 || !shellContext?.includes('[react-jsx-prop]')) {
  fail('expected `hook cursor` to gate a shell command touching a bad .jsx file', cursorShell);
}

const claudeShellClean = runHook('claude', {
  tool_name: 'Bash',
  tool_input: { command: 'ls tests/fixtures/clean/app.tsx && npm test' },
  cwd: root,
});
if (claudeShellClean.status !== 0) {
  fail('expected `hook claude` to pass a shell command touching only clean sources', claudeShellClean);
}

// Glob edits are expanded against the filesystem: the literal token
// `tests/fixtures/violations/*.tsx` never exists, but the files it edits do.
const claudeShellGlob = runHook('claude', {
  tool_name: 'Bash',
  tool_input: { command: "sed -i 's/foo/bar/' tests/fixtures/violations/*.tsx" },
  cwd: root,
});
if (claudeShellGlob.status !== 2 || !claudeShellGlob.stderr.includes('[react-import]')) {
  fail('expected `hook claude` to gate files edited through a glob pattern', claudeShellGlob);
}

// `**` also matches zero directories: the file directly under the `**`
// segment's parent is covered, not only files in deeper subdirectories.
const claudeShellGlobstar = runHook('claude', {
  tool_name: 'Bash',
  tool_input: { command: "sed -i 's/foo/bar/' tests/fixtures/violations/**/bad.tsx" },
  cwd: root,
});
if (claudeShellGlobstar.status !== 2 || !claudeShellGlobstar.stderr.includes('[react-import]')) {
  fail('expected `hook claude` to gate a file matched by a zero-directory globstar', claudeShellGlobstar);
}

// Claude Stop gate: the agent cannot end its turn while the project has
// findings; stop_hook_active (already continuing due to this gate) passes
// through so the agent can never loop forever.
const project = mkdtempSync(join(tmpdir(), 'solid2-kit-stop-'));
process.on('exit', () => rmSync(project, { recursive: true, force: true }));
writeFileSync(join(project, 'package.json'), '{ "name": "stop-fixture" }\n');
mkdirSync(join(project, 'src'), { recursive: true });
writeFileSync(join(project, 'src/App.tsx'), 'export const App = () => <div className="x" />;\n');

const stopDirty = runHook('claude', { hook_event_name: 'Stop' }, { cwd: project });
if (stopDirty.status !== 2 || !stopDirty.stderr.includes('[react-jsx-prop]')) {
  fail('expected the Stop gate to block finishing while findings remain', stopDirty);
}

const stopLoop = runHook('claude', { hook_event_name: 'Stop', stop_hook_active: true }, { cwd: project });
if (stopLoop.status !== 0) fail('expected the Stop gate to pass through when stop_hook_active', stopLoop);

writeFileSync(join(project, 'src/App.tsx'), 'export const App = () => <div class="x" />;\n');
const stopClean = runHook('claude', { hook_event_name: 'Stop' }, { cwd: project });
if (stopClean.status !== 0) fail('expected the Stop gate to pass on a clean project', stopClean);

// --- pre-execution guard ------------------------------------------------

// Editing kit-owned guardrail files is denied before the tool runs.
const tamperEdit = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: '.cursor/rules/solid-2.mdc', old_string: 'a', new_string: 'b' },
});
if (tamperEdit.status !== 2 || !tamperEdit.stderr.includes('guardrail')) {
  fail('expected the guard to deny editing a kit-owned rules file', tamperEdit);
}

const tamperShell = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'rm -rf .claude/skills/solid-2' },
});
if (tamperShell.status !== 2) fail('expected the guard to deny deleting the kit skill', tamperShell);

const readGuardrail = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'cat .cursor/rules/solid-2.mdc' },
});
if (readGuardrail.status !== 0) fail('expected the guard to allow reading guardrail files', readGuardrail);

// Removing the kit marker from hook configs / managed blocks is denied;
// marker-preserving edits pass.
const markerRemoval = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Edit',
  tool_input: {
    file_path: '.claude/settings.json',
    old_string: '"command": "node node_modules/solid2-agent-kit/bin/solid2-kit.mjs hook claude"',
    new_string: '',
  },
});
if (markerRemoval.status !== 2) fail('expected the guard to deny removing kit hook entries', markerRemoval);

const markerKept = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: '.claude/settings.json', old_string: '"Bash(ls)"', new_string: '"Bash(ls -la)"' },
});
if (markerKept.status !== 0) fail('expected the guard to allow marker-preserving settings edits', markerKept);

// Banned dependency installs are denied before they run; lookalike package
// names are not (token match, not substring).
const bannedDep = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'npm install react@19 && npm run build' },
});
if (bannedDep.status !== 2 || !bannedDep.stderr.includes('react')) {
  fail('expected the guard to deny installing react', bannedDep);
}

const lookalikeDep = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'bun add react-aria @solidjs/router' },
});
if (lookalikeDep.status !== 0) fail('expected the guard to allow lookalike package names', lookalikeDep);

// An interpreter running inline code is a rewrite tool too: `node -e` with
// fs.writeFileSync must hit the same protected-path checks as sed/rm, or
// the guard can be switched off by rewriting its own hook config.
const evalTamper = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: {
    command: `node -e "require('node:fs').writeFileSync('.claude/settings.json', '{}')"`,
  },
});
if (evalTamper.status !== 2) fail('expected the guard to deny rewriting hook config via node -e', evalTamper);

const evalBenign = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'node -e "console.log(1 + 1)"' },
});
if (evalBenign.status !== 0) fail('expected the guard to allow inline code that touches no protected path', evalBenign);

// A protected path split across a variable assignment is expanded before
// the path checks, so the indirection does not hide it. Both payloads keep
// the literal protected path out of the raw command string entirely (the
// pre-fix guard let both through).
const varTamper = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: "D=.claude; sed -i '' $D/settings.json" },
});
if (varTamper.status !== 2) fail('expected the guard to deny a variable-hidden hook config path', varTamper);

const varGuardrail = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'D=.claude/skills; rm -rf $D/solid-2' },
});
if (varGuardrail.status !== 2) fail('expected the guard to deny a variable-hidden guardrail path', varGuardrail);

// The install verb can sit behind flags that take a separate value; the
// banned-dependency check must still find it (and still allow clean ones).
const flaggedInstall = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'npm --prefix . install react' },
});
if (flaggedInstall.status !== 2 || !flaggedInstall.stderr.includes('react')) {
  fail('expected the guard to deny a banned install behind a value-taking flag', flaggedInstall);
}

const flaggedCleanInstall = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'npm --prefix . install lodash' },
});
if (flaggedCleanInstall.status !== 0) {
  fail('expected the guard to allow a clean install behind a value-taking flag', flaggedCleanInstall);
}

// Punctuation glued to a token does not hide the package name, a subshell
// does not hide the manager, and yarn's `global` modifier does not hide
// the verb.
for (const [label, command] of [
  ['semicolon-attached', 'npm install react; echo done'],
  ['subshell', '(npm install react)'],
  ['yarn-global', 'yarn global add react'],
  ['glued-separator', 'npm install react&&echo done'],
  ['workspace-filter', 'pnpm --filter myapp install react'],
  ['yarn-global-flag-value', 'yarn global --prefix /tmp/x add react'],
]) {
  const result = runHook('claude', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
  });
  if (result.status !== 2) fail(`expected the guard to deny the ${label} banned install`, result);
}

// Segments are judged on their own: a write verb in one segment must not
// condemn a protected path that another segment only reads.
const installThenRead = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'npm install lodash && cat .claude/settings.json' },
});
if (installThenRead.status !== 0) {
  fail('expected the guard to allow reading hook config in a separate segment', installThenRead);
}

const awkRead = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: "awk '{print}' .claude/settings.json" },
});
if (awkRead.status !== 0) fail('expected the guard to allow a read-only awk over hook config', awkRead);

// A pipeline is one dataflow: a protected path on the left of `|` still
// reaches the write verb on its right.
const pipeTamper = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'echo .claude/settings.json | xargs rm' },
});
if (pipeTamper.status !== 2) fail('expected the guard to deny deleting hook config through a pipeline', pipeTamper);

// A for-loop variable carries its list into the loop body; the expansion
// sees the path even though the `rm` segment only names the variable.
const loopTamper = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'for f in .claude/settings.json; do rm $f; done' },
});
if (loopTamper.status !== 2) fail('expected the guard to deny deleting hook config through a for loop', loopTamper);

// An escaped quote inside a double-quoted string does not end the string:
// the inline-eval body stays one segment and its write call is judged.
const escapedEvalTamper = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: {
    command: 'node -e "x=\\";\\"; require(\'fs\').writeFileSync(\'.claude/settings.json\',\'{}\')"',
  },
});
if (escapedEvalTamper.status !== 2) {
  fail('expected the guard to deny an inline-eval rewrite behind an escaped quote', escapedEvalTamper);
}

// A backslash-escaped separator names the same file, and an assignment
// inside a subshell still binds for the commands that follow it there.
const escapedPathTamper = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'rm .claude\\/settings.json' },
});
if (escapedPathTamper.status !== 2) {
  fail('expected the guard to deny a backslash-escaped hook config path', escapedPathTamper);
}

const subshellVarTamper = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: "(P=.claude/settings.json; sed -i '' $P)" },
});
if (subshellVarTamper.status !== 2) {
  fail('expected the guard to deny a subshell-wrapped variable-hidden path', subshellVarTamper);
}

// Pre-execution events never run the content check: an ordinary edit to a
// (currently bad) source file must be allowed so the agent can fix it.
const preEditAllowed = runHook('claude', {
  hook_event_name: 'PreToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: badFile, old_string: 'a', new_string: 'b' },
});
if (preEditAllowed.status !== 0 || preEditAllowed.stderr.trim() !== '') {
  fail('expected PreToolUse to allow ordinary source edits without content checks', preEditAllowed);
}

// Cursor deny channel: permission JSON on stdout.
const cursorTamper = runHook('cursor', {
  hook_event_name: 'beforeShellExecution',
  command: "sed -i 's/x/y/' .cursor/rules/solid-2.mdc",
});
const cursorDecision = JSON.parse(cursorTamper.stdout || '{}');
if (cursorTamper.status !== 0 || cursorDecision.permission !== 'deny') {
  fail('expected the cursor guard to deny shell tampering with permission JSON', cursorTamper);
}

const cursorWriteGuardrail = runHook('cursor', {
  hook_event_name: 'preToolUse',
  tool_name: 'Write',
  tool_input: { file_path: '.cursor/skills/solid-2/SKILL.md', content: 'weakened' },
});
if (JSON.parse(cursorWriteGuardrail.stdout || '{}').permission !== 'deny') {
  fail('expected the cursor guard to deny writing to the kit skill', cursorWriteGuardrail);
}

console.log(
  'hook — OK (claude stderr+exit2, cursor additional_context, shell-edit coverage incl. globs, Stop gate with loop guard, pre-execution guard: tamper + banned installs denied incl. inline-eval, variable-hidden paths and value-flag installs, ordinary edits allowed)',
);
