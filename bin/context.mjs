// Shared CLI context: the kit's identity (root, version) and argv parsing,
// imported by every command module. A singleton module, so the values are
// computed once, exactly as the single-file CLI computed them at startup.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const VERSION = JSON.parse(readFileSync(join(KIT_ROOT, 'package.json'), 'utf8')).version;

export const args = process.argv.slice(2);
export const command = args[0];

export function flagValue(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 || index + 1 >= args.length ? fallback : args[index + 1];
}

const VALUE_FLAGS = new Set(['--dir', '--target']);

export function positionalArgs() {
  const out = [];
  for (let i = 1; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
      if (VALUE_FLAGS.has(args[i])) i += 1;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}
