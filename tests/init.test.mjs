#!/usr/bin/env node
// Tests for the hook wiring done by `solid2-kit init`: merges into
// .cursor/hooks.json and .claude/settings.json must preserve existing user
// entries, be idempotent across re-runs, and be skipped (with a note) when
// the kit is not installed as a local dependency.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const kit = join(root, 'bin/solid2-kit.mjs');

function runInit(target, ...extra) {
  return spawnSync(process.execPath, [kit, 'init', '--target', target, ...extra], {
    encoding: 'utf8',
  });
}

function fail(message, result) {
  console.error(message);
  if (result?.stdout) console.error(result.stdout);
  if (result?.stderr) console.error(result.stderr);
  process.exit(1);
}

const target = mkdtempSync(join(tmpdir(), 'solid2-kit-init-'));
process.on('exit', () => rmSync(target, { recursive: true, force: true }));

// Pre-existing user hook config that the merge must preserve.
mkdirSync(join(target, '.cursor'), { recursive: true });
writeFileSync(
  join(target, '.cursor/hooks.json'),
  JSON.stringify({ version: 1, hooks: { postToolUse: [{ command: './user-audit.sh' }] } }, null, 2),
);
mkdirSync(join(target, '.claude'), { recursive: true });
writeFileSync(
  join(target, '.claude/settings.json'),
  JSON.stringify(
    {
      permissions: { allow: ['Bash(npm test)'] },
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: './user-stop.sh' }] }],
        // A stale kit entry from an older version: sync must refresh it in
        // place (updated matcher) instead of duplicating it.
        PostToolUse: [
          {
            matcher: 'Edit|Write',
            hooks: [
              {
                type: 'command',
                command: 'node node_modules/solid2-agent-kit/bin/solid2-kit.mjs hook claude',
                timeout: 30,
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  ),
);

// Without a local install, init must skip hooks and say why.
const noInstall = runInit(target);
if (noInstall.status !== 0 || !noInstall.stdout.includes('edit-time hooks not wired')) {
  fail('expected init without a local kit install to note that hooks were skipped', noInstall);
}
let cursorHooks = JSON.parse(readFileSync(join(target, '.cursor/hooks.json'), 'utf8'));
if (cursorHooks.hooks.postToolUse.length !== 1) {
  fail('expected no cursor hook to be added without a local kit install', noInstall);
}

// Simulate the kit installed as a devDependency.
mkdirSync(join(target, 'node_modules/solid2-agent-kit/bin'), { recursive: true });
writeFileSync(join(target, 'node_modules/solid2-agent-kit/bin/solid2-kit.mjs'), '// stub\n');

for (const run of [1, 2]) {
  const result = runInit(target);
  if (result.status !== 0) fail(`init run ${run} failed`, result);

  cursorHooks = JSON.parse(readFileSync(join(target, '.cursor/hooks.json'), 'utf8'));
  const cursorEntries = cursorHooks.hooks.postToolUse;
  const kitCursor = cursorEntries.filter((entry) => entry.command?.includes('solid2-kit.mjs hook cursor'));
  if (cursorHooks.version !== 1 || cursorEntries[0].command !== './user-audit.sh' || kitCursor.length !== 1) {
    fail(`run ${run}: expected exactly one kit cursor hook merged after the user's entry`, result);
  }

  const claudeSettings = JSON.parse(readFileSync(join(target, '.claude/settings.json'), 'utf8'));
  const isKitEntry = (entry) =>
    entry.hooks?.some((item) => item.command?.includes('solid2-kit.mjs hook claude'));
  const kitClaude = claudeSettings.hooks.PostToolUse.filter(isKitEntry);
  if (
    kitClaude.length !== 1 ||
    kitClaude[0].matcher !== 'Edit|MultiEdit|Write|Bash' ||
    !claudeSettings.permissions
  ) {
    fail(`run ${run}: expected the stale kit claude hook refreshed in place (Bash matcher) alongside existing settings`, result);
  }
  const stopEntries = claudeSettings.hooks.Stop;
  if (
    stopEntries.filter(isKitEntry).length !== 1 ||
    stopEntries[0].hooks[0].command !== './user-stop.sh'
  ) {
    fail(`run ${run}: expected exactly one kit Stop gate merged after the user's Stop hook`, result);
  }

  for (const command of ['.cursor/commands/solid2-review.md', '.claude/commands/solid2-review.md']) {
    if (!readFileSync(join(target, command), 'utf8').includes('solid2-kit.mjs')) {
      fail(`run ${run}: expected ${command} to be installed`, result);
    }
  }
}

// --no-hooks leaves hook configs alone even when the kit is installed.
const optOutTarget = mkdtempSync(join(tmpdir(), 'solid2-kit-nohooks-'));
process.on('exit', () => rmSync(optOutTarget, { recursive: true, force: true }));
mkdirSync(join(optOutTarget, 'node_modules/solid2-agent-kit/bin'), { recursive: true });
writeFileSync(join(optOutTarget, 'node_modules/solid2-agent-kit/bin/solid2-kit.mjs'), '// stub\n');
const optOut = runInit(optOutTarget, '--no-hooks');
if (optOut.status !== 0) fail('init --no-hooks failed', optOut);
let optOutWroteHooks = true;
try {
  readFileSync(join(optOutTarget, '.cursor/hooks.json'));
} catch {
  optOutWroteHooks = false;
}
if (optOutWroteHooks) fail('expected --no-hooks to skip .cursor/hooks.json entirely', optOut);

console.log('init hooks — OK (skip note without install, idempotent merge preserving user config, --no-hooks opt-out)');
