// `check`: the filesystem driver for the pattern gate — walk the sources,
// read them, run the scanners, print the findings.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { flagValue, positionalArgs } from './context.mjs';
import { CHECKS, importedNames } from './scanners.mjs';

export const SOURCE_FILE = /(?<!\.d)\.(?:tsx?|jsx)$/;

// Blank comment interiors (preserving newlines and offsets) so banned tokens
// mentioned in comments ("migrated off createResource") do not trip the gate.
// String and template contents are preserved — some checks match string
// literals ("use client"). This is a heuristic scanner, not a JS lexer: a
// regex literal containing escaped slashes or `//` in JSX text can blank the
// remainder of that one line (false negatives only, never false positives).
function stripComments(content) {
  let out = '';
  let state = 'code';
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (state === 'code') {
      if (ch === '/' && (next === '/' || next === '*')) {
        state = next === '/' ? 'line' : 'block';
        out += '  ';
        i += 1;
      } else {
        if (ch === "'") state = 'single';
        else if (ch === '"') state = 'double';
        else if (ch === '`') state = 'template';
        out += ch;
      }
    } else if (state === 'line') {
      if (ch === '\n') state = 'code';
      out += ch === '\n' ? ch : ' ';
    } else if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code';
        out += '  ';
        i += 1;
      } else {
        out += ch === '\n' ? ch : ' ';
      }
    } else {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 1;
      } else if (
        (state === 'single' && ch === "'") ||
        (state === 'double' && ch === '"') ||
        (state === 'template' && ch === '`')
      ) {
        state = 'code';
      }
    }
  }
  return out;
}

// Dependencies and dot-directories (.git, build caches, installed agent
// guidance) are never project sources, so `check .` stays meaningful.
export function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) yield* walk(path);
    } else if (SOURCE_FILE.test(entry.name)) {
      yield path;
    }
  }
}

// One formatted finding per pattern match: "path:line [id] message\n  > source".
// Patterns run against comment-stripped content (same offsets); the quoted
// source line comes from the original file.
export function fileFindings(file, relativeTo) {
  const raw = readFileSync(file, 'utf8');
  const content = stripComments(raw);
  const lines = raw.split('\n');
  const findings = [];
  for (const rule of CHECKS) {
    const exempt = rule.exemptImportsFrom ? importedNames(content, rule.exemptImportsFrom) : null;
    for (const match of rule.find ? rule.find(content) : content.matchAll(rule.pattern)) {
      if (exempt?.has(match[0].match(/[\w$]+/)[0])) continue;
      const lineNumber = content.slice(0, match.index).split('\n').length;
      findings.push(
        `${relative(relativeTo, file) || file}:${lineNumber} [${rule.id}] ${rule.message}\n  > ${lines[lineNumber - 1].trim()}`,
      );
    }
  }
  return findings;
}

export function check() {
  const target = resolve(flagValue('--target', '.'));
  const pathArgs = positionalArgs();

  let files;
  let scanned;
  let walked = true;
  if (pathArgs.length > 0) {
    // Explicit path mode: named directories are walked, named files are
    // checked when they are .ts/.tsx/.jsx sources.
    files = [];
    scanned = pathArgs;
    walked = false;
    // A missing path is always an error: a deleted file, a misspelled file, and
    // a renamed source directory look the same here, and only the list's
    // producer knows which it was.
    for (const arg of pathArgs) {
      const path = resolve(target, arg);
      if (!existsSync(path)) {
        console.error(
          `solid2-kit check — path not found: ${path} (drop deleted files from a changed-file list with \`git diff --name-only --diff-filter=d\`)`,
        );
        process.exit(2);
      }
      if (statSync(path).isDirectory()) {
        walked = true;
        files.push(...walk(path));
      } else if (SOURCE_FILE.test(path)) {
        files.push(path);
      }
    }
  } else {
    const srcDir = resolve(target, flagValue('--dir', 'src'));
    if (!existsSync(srcDir)) {
      console.error(`solid2-kit check — source directory not found: ${srcDir} (use --dir)`);
      process.exit(2);
    }
    files = [...walk(srcDir)];
    scanned = [relative(target, srcDir) || '.'];
  }

  // A walk that found no sources points at the wrong tree; passing it would
  // read as a clean gate in CI and in agent loops. A list of named files with
  // no sources among them (changed-file pipelines on a docs-only change) has
  // nothing to gate and passes.
  if (files.length === 0 && !walked) {
    console.log('solid2-kit check — OK (no .ts/.tsx/.jsx sources among the named files; nothing to check).');
    return;
  }
  if (files.length === 0) {
    console.error(
      `solid2-kit check — no .ts/.tsx/.jsx sources found in ${scanned.join(', ')}; nothing was checked. Point --dir or [paths...] at the source tree.`,
    );
    process.exit(2);
  }

  let findings = 0;
  for (const file of files) {
    for (const finding of fileFindings(file, target)) {
      findings += 1;
      console.error(finding);
    }
  }

  if (findings > 0) {
    console.error(`\nsolid2-kit check — ${findings} finding(s) in ${files.length} file(s).`);
    process.exit(1);
  }
  console.log(`solid2-kit check — OK (${files.length} files scanned).`);
}
