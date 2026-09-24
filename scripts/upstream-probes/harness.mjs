// Helpers handed to every probe as `h`. Probes run against the packages
// installed in `dir` (check-upstream.mjs builds that directory); anything that
// executes package code does so in a child process so a hang or a crash stays
// inside one probe.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const TIMEOUT_MS = 120_000;

export function createHarness(dir) {
  const scratch = join(dir, '.probe-scratch');
  let counter = 0;

  function writeTree(name, files) {
    const root = join(scratch, `${name}-${++counter}`);
    rmSync(root, { recursive: true, force: true });
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return root;
  }

  function run(args) {
    const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: TIMEOUT_MS });
    if (result.error) throw result.error;
    return { code: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr };
  }

  return {
    dir,

    read(pkg, path) {
      return readFileSync(join(dir, 'node_modules', pkg, path), 'utf8');
    },

    // Runs an ES module in Node. Client-side claims pass
    // `conditions: ['browser', 'development']` (dev build) or `['browser']`
    // (prod build); no conditions selects the server build.
    node(source, { conditions = [] } = {}) {
      const root = writeTree('node', { 'probe.mjs': source });
      return run([...conditions.map((c) => `--conditions=${c}`), join(root, 'probe.mjs')]);
    },

    // Same, for a module whose last stdout line is `console.log(JSON.stringify(result))`.
    nodeJson(source, options) {
      const result = this.node(source, options);
      const last = result.stdout.trim().split('\n').at(-1) ?? '';
      try {
        return { ...JSON.parse(last), stderr: result.stderr };
      } catch {
        throw new Error(`probe script printed no JSON result (exit ${result.code}):\n${result.output.slice(0, 2000)}`);
      }
    },

    // `vite build` of a throwaway project; `files` are paths relative to its root.
    viteBuild(files) {
      const root = writeTree('vite', { 'index.html': '<script type="module" src="./main.js"></script>\n', ...files });
      return run([join(dir, 'node_modules/vite/bin/vite.js'), 'build', root, '--logLevel', 'error']);
    },

    // Type-checks one TSX module the way a kit project is configured.
    // Returns the diagnostic codes and, per named import, its JSDoc tag names.
    typecheck(source) {
      const ts = createRequire(join(dir, 'package.json'))('typescript');
      const root = writeTree('ts', { 'probe.tsx': source });
      const file = join(root, 'probe.tsx');
      const program = ts.createProgram([file], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.Preserve,
        jsxImportSource: '@solidjs/web',
      });
      const checker = program.getTypeChecker();
      const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => ({
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
      }));
      const tags = {};
      (function visit(node) {
        if (ts.isImportSpecifier(node)) {
          const symbol = checker.getSymbolAtLocation(node.name);
          const target = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
          tags[node.name.text] = target ? target.getJsDocTags(checker).map((tag) => tag.name) : [];
        }
        ts.forEachChild(node, visit);
      })(program.getSourceFile(file));
      return { codes: diagnostics.map((d) => d.code), diagnostics, tags };
    },
  };
}
