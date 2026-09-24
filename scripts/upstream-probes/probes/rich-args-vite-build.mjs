export const claim =
  'Importing enableRichArguments from @solidjs/web/server-functions/rich-args fails `vite build` ("./client" is not exported).';
export const packages = ['@solidjs/web', '@solidjs/vite-plugin'];
export const issue = 'https://github.com/solidjs/solid/issues/3627';

const main = `import { enableRichArguments } from "@solidjs/web/server-functions/rich-args";\nenableRichArguments();\n`;
const config = `import solid from "@solidjs/vite-plugin";\nexport default { plugins: [solid()] };\n`;

export async function probe(h) {
  // Root cause: the nested server-functions/package.json captures the
  // package's self-import of its own ./server-functions/client subpath.
  const cause = h.nodeJson(`
    import { createRequire } from "node:module";
    const require = createRequire(import.meta.resolve("@solidjs/web/server-functions/rich-args"));
    let captured = false;
    try { require.resolve("@solidjs/web/server-functions/client"); } catch (e) { captured = e.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"; }
    console.log(JSON.stringify({ captured }));
  `);
  const build = h.viteBuild({ 'main.js': main, 'vite.config.mjs': config });
  const fails = build.code !== 0 && build.output.includes('"./client" is not exported');
  return {
    reproduces: fails,
    observed: [
      `vite build ${build.code === 0 ? 'passes' : fails ? 'fails with "./client" is not exported' : `fails differently: ${build.output.trim().split('\n')[0]}`}`,
      `CJS self-import ${cause.captured ? 'still captured by the nested package.json' : 'resolves'}`,
    ].join('; '),
  };
}
