#!/usr/bin/env node
// solid2-agent-kit CLI — installs and maintains Solid 2.0 guidance for AI
// coding agents (Cursor and Claude Code), and runs a mechanical pattern gate.
//
//   solid2-kit init  [--cursor] [--claude] [--no-hooks] [--target <dir>]
//   solid2-kit sync  [--cursor] [--claude] [--no-hooks] [--target <dir>]   (alias of init)
//   solid2-kit check [--dir <srcdir>] [--target <dir>] [paths...]
//   solid2-kit doctor [--target <dir>]
//   solid2-kit hook (claude|cursor)          (stdin: agent hook JSON payload)
//
// `init`/`sync` are idempotent: kit-owned files are overwritten, managed
// blocks in AGENTS.md / CLAUDE.md are replaced in place, and hook entries in
// .cursor/hooks.json / .claude/settings.json are merged without duplicates.

import { check } from './check.mjs';
import { args, command, VERSION } from './context.mjs';
import { doctor } from './doctor.mjs';
import { hook } from './hook.mjs';
import { init } from './init.mjs';

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
        '  solid2-kit check [--dir <srcdir>] [--target <dir>] [paths...]         mechanical React/Solid 1.x pattern gate (default dir: src)',
        '  solid2-kit doctor [--target <dir>]                                    project-wiring gate: deps, tsconfig, root configs',
        '  solid2-kit hook (claude|cursor)                                       edit-time gate for agent hooks (stdin: hook JSON payload)',
      ].join('\n'),
    );
    process.exit(command ? 2 : 0);
}
