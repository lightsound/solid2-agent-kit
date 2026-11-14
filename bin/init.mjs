// `init` / `sync`: install or refresh the kit's guidance in a consuming
// project (kit-owned files, managed blocks, hook wiring, the lint script).

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { BASELINE } from './baseline.mjs';
import { KIT_ROOT, VERSION, args, flagValue } from './context.mjs';


function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function upsertManagedBlock(filePath, blockId, body, createPreamble) {
  const start = `<!-- solid2-agent-kit:${blockId}:start -->`;
  const end = `<!-- solid2-agent-kit:${blockId}:end -->`;
  const note = `<!-- Managed by solid2-agent-kit v${VERSION}. Do not edit inside this block; run \`solid2-kit sync\` to update. -->`;
  const block = `${start}\n${note}\n\n${body.trim()}\n\n${end}`;

  let content = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const starts = countOccurrences(content, start);
  const ends = countOccurrences(content, end);

  if (starts === 1 && ends === 1) {
    // Function replacement: a plain string would have `$&`/`$'`-style
    // sequences in the body interpreted as replacement patterns.
    content = content.replace(new RegExp(`${start}[\\s\\S]*?${end}`), () => block);
  } else if (starts === 0 && ends === 0) {
    const base = content.trim() ? content.trimEnd() : (createPreamble ?? '').trimEnd();
    content = `${base}${base ? '\n\n' : ''}${block}\n`;
  } else {
    // Malformed markers (a stray delete or a duplicated block). Touching the
    // file could swallow user content between mismatched markers, so leave
    // it alone and ask for a manual fix.
    console.warn(
      `solid2-kit — warning: malformed managed-block markers in ${filePath} (${starts} start / ${ends} end for "${blockId}"). File left untouched; repair the markers and re-run sync.`,
    );
    return null;
  }
  writeFileSync(filePath, content);
  return filePath;
}

function writeKitOwnedFile(filePath, body) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, body);
  return filePath;
}

// Hook commands run from the project root without node_modules/.bin on PATH,
// so they invoke the locally installed kit through node directly. `init` only
// wires hooks when that file exists (kit installed as a dependency).
const KIT_LOCAL_BIN = 'node_modules/solid2-agent-kit/bin/solid2-kit.mjs';

function readJsonConfig(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(
      `solid2-kit — warning: ${filePath} is not valid JSON. File left untouched; fix it and re-run sync to wire the edit hook.`,
    );
    return null;
  }
}

function writeJsonConfig(filePath, config) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
  return filePath;
}

// Replace the existing kit-owned entry (identified by the marker in its
// command) or append a fresh one — sync then updates matchers/commands that
// changed between kit versions while leaving user entries untouched.
function upsertHookEntry(entries, marker, entry, matches) {
  const index = entries.findIndex((existing) => matches(existing, marker));
  if (index === -1) entries.push(entry);
  else entries[index] = entry;
}

const cursorEntryMatches = (entry, marker) =>
  typeof entry?.command === 'string' && entry.command.includes(marker);
const claudeEntryMatches = (entry, marker) =>
  (entry?.hooks ?? []).some((item) => typeof item?.command === 'string' && item.command.includes(marker));

// Cursor hooks: postToolUse (post-edit check injected as additional_context)
// plus preToolUse / beforeShellExecution (pre-execution guard: guardrail
// tampering and banned-dependency installs are denied before they run).
function upsertCursorHook(target) {
  const filePath = join(target, '.cursor/hooks.json');
  const config = readJsonConfig(filePath);
  if (config === null) return null;
  config.version ??= 1;
  config.hooks ??= {};
  const command = `node ${KIT_LOCAL_BIN} hook cursor`;
  for (const event of ['postToolUse', 'preToolUse', 'beforeShellExecution']) {
    upsertHookEntry((config.hooks[event] ??= []), 'solid2-kit.mjs hook cursor', { command }, cursorEntryMatches);
  }
  return writeJsonConfig(filePath, config);
}

// Claude Code hooks: PostToolUse (`hook claude` prints findings to stderr and
// exits 2, which Claude Code feeds back into the model as correction context;
// Bash is matched so shell edits via sed/heredocs are gated too), PreToolUse
// (pre-execution guard, may deny) and Stop (whole-project final gate — the
// agent cannot end its turn with findings).
function upsertClaudeHook(target) {
  const filePath = join(target, '.claude/settings.json');
  const config = readJsonConfig(filePath);
  if (config === null) return null;
  config.hooks ??= {};
  const command = `node ${KIT_LOCAL_BIN} hook claude`;
  const toolMatcher = 'Edit|MultiEdit|Write|Bash';
  upsertHookEntry(
    (config.hooks.PreToolUse ??= []),
    'solid2-kit.mjs hook claude',
    { matcher: toolMatcher, hooks: [{ type: 'command', command, timeout: 30 }] },
    claudeEntryMatches,
  );
  upsertHookEntry(
    (config.hooks.PostToolUse ??= []),
    'solid2-kit.mjs hook claude',
    { matcher: toolMatcher, hooks: [{ type: 'command', command, timeout: 30 }] },
    claudeEntryMatches,
  );
  upsertHookEntry(
    (config.hooks.Stop ??= []),
    'solid2-kit.mjs hook claude',
    { hooks: [{ type: 'command', command, timeout: 60 }] },
    claudeEntryMatches,
  );
  return writeJsonConfig(filePath, config);
}

// Wire a `lint:solid` script (referenced by the AGENTS.md guidance) into the
// consuming project so agents and CI can run both gates by name.
function upsertLintScript(target) {
  const filePath = join(target, 'package.json');
  if (!existsSync(filePath)) return null;
  const pkg = readJsonConfig(filePath);
  if (pkg === null) return null;
  if (pkg.scripts?.['lint:solid']) return null;
  (pkg.scripts ??= {})['lint:solid'] = 'solid2-kit check && solid2-kit doctor';
  return writeJsonConfig(filePath, pkg);
}

function copySkill(targetSkillDir) {
  // The skill directory is kit-owned: remove it first so files deleted in
  // newer kit versions do not linger after a sync.
  rmSync(targetSkillDir, { recursive: true, force: true });
  mkdirSync(targetSkillDir, { recursive: true });
  cpSync(join(KIT_ROOT, 'files/skills/solid-2'), targetSkillDir, { recursive: true });
  return targetSkillDir;
}

export function init() {
  const target = resolve(flagValue('--target', '.'));
  const onlyCursor = args.includes('--cursor') && !args.includes('--claude');
  const onlyClaude = args.includes('--claude') && !args.includes('--cursor');
  const wantCursor = !onlyClaude;
  const wantClaude = !onlyCursor;

  const rulesBody = readFileSync(join(KIT_ROOT, 'files/shared/rules-body.md'), 'utf8');
  const agentsSection = readFileSync(join(KIT_ROOT, 'files/shared/agents-section.md'), 'utf8');
  const reviewCommand = readFileSync(join(KIT_ROOT, 'files/commands/solid2-review.md'), 'utf8');
  const written = [];

  if (wantCursor) {
    const mdc = [
      '---',
      'description: Solid 2.0 JSX and reactivity rules — prevents React and Solid 1.x patterns in TSX files',
      'globs: **/*.tsx,**/*.jsx',
      'alwaysApply: false',
      '---',
      '',
      `<!-- Generated by solid2-agent-kit v${VERSION}. Do not edit; run \`solid2-kit sync\` to update. -->`,
      '',
      rulesBody.trim(),
      '',
    ].join('\n');
    written.push(writeKitOwnedFile(join(target, '.cursor/rules/solid-2.mdc'), mdc));
    written.push(copySkill(join(target, '.cursor/skills/solid-2')));
    written.push(writeKitOwnedFile(join(target, '.cursor/commands/solid2-review.md'), reviewCommand));
  }

  if (wantClaude) {
    written.push(copySkill(join(target, '.claude/skills/solid-2')));
    written.push(writeKitOwnedFile(join(target, '.claude/commands/solid2-review.md'), reviewCommand));
    // Claude Code has no glob-attached rules mechanism; CLAUDE.md is always
    // loaded, so the full rules body lives there in a managed block.
    written.push(
      upsertManagedBlock(
        join(target, 'CLAUDE.md'),
        'solid-rules',
        rulesBody,
        '# CLAUDE.md\n\nProject guidance for Claude Code.',
      ),
    );
  }

  written.push(
    upsertManagedBlock(
      join(target, 'AGENTS.md'),
      'agents-section',
      agentsSection,
      '# AGENTS.md\n\nProject-specific context for coding agents.',
    ),
  );

  // Edit-time hooks: run the mechanical gate automatically on every agent
  // file edit, so enforcement does not depend on the agent remembering to
  // run `solid2-kit check`.
  let hooksNote = null;
  if (!args.includes('--no-hooks')) {
    if (existsSync(join(target, KIT_LOCAL_BIN))) {
      if (wantCursor) written.push(upsertCursorHook(target));
      if (wantClaude) written.push(upsertClaudeHook(target));
      written.push(upsertLintScript(target));
    } else {
      hooksNote =
        'edit-time hooks not wired: install the kit as a devDependency ("solid2-agent-kit": "github:lightsound/solid2-agent-kit") so `node node_modules/solid2-agent-kit/bin/solid2-kit.mjs` resolves, then re-run sync. Pass --no-hooks to silence this note.';
    }
  }

  console.log(`solid2-agent-kit v${VERSION} — installed for ${[wantCursor && 'Cursor', wantClaude && 'Claude Code'].filter(Boolean).join(' + ')}:`);
  for (const path of written.filter(Boolean)) console.log(`  ${relative(target, path) || '.'}`);
  if (hooksNote) console.log(`  note: ${hooksNote}`);
  if (!hasDiagnosticsDependency(target)) {
    console.log(
      `  note: the solid-2 skill's development loop drives the dev server's /__solid/diagnostics endpoint; add "@solidjs/diagnostics" to devDependencies (install @solidjs/diagnostics@^${BASELINE['@solidjs/diagnostics'].baseline} — npm \`latest\` can be an older rc) so @solidjs/vite-plugin serves it (auto-on when declared). Without it the fallback is an isDev-guarded attribution.enable({ log: false }).`,
    );
  }
}

// Whether the consuming project declares @solidjs/diagnostics — the signal
// @solidjs/vite-plugin uses to auto-enable the diagnostics endpoint. An
// informational note only: `doctor` does not fail without it.
function hasDiagnosticsDependency(target) {
  const filePath = join(target, 'package.json');
  if (!existsSync(filePath)) return true;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return true;
  }
  return '@solidjs/diagnostics' in { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
}
