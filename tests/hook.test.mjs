#!/usr/bin/env node
// Tests for `solid2-kit hook (claude|cursor)` — the edit-time gate wired into
// agent hook systems. Verifies each agent's feedback channel and that
// non-write payloads and malformed input never disturb the agent loop.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const kit = join(root, 'bin/solid2-kit.mjs');
const badFile = join(root, 'tests/fixtures/violations/bad.tsx');
const cleanFile = join(root, 'tests/fixtures/clean/app.tsx');

function runHook(agent, payload) {
  return spawnSync(process.execPath, [kit, 'hook', agent], {
    encoding: 'utf8',
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
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

console.log('hook — OK (claude stderr+exit2, cursor additional_context, read-tool and malformed payloads ignored)');
