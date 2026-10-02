export const claim =
  'Importing enableRichArguments from @solidjs/web/server-functions/rich-args passes `vite build` with no resolve.dedupe workaround (the rc.9 "./client" is not exported failure is fixed).';
export const packages = ['@solidjs/web', '@solidjs/vite-plugin'];
export const issue = 'https://github.com/solidjs/solid/issues/3627';

const main = `import { enableRichArguments } from "@solidjs/web/server-functions/rich-args";\nenableRichArguments();\n`;
const config = `import solid from "@solidjs/vite-plugin";\nexport default { plugins: [solid()] };\n`;

export async function probe(h) {
  // rc.9 failed because the nested server-functions/package.json declared an
  // exports map that captured the package's self-import of ./server-functions/client;
  // rc.10 dropped those nested maps.
  const build = h.viteBuild({ 'main.js': main, 'vite.config.mjs': config });
  return {
    reproduces: build.code === 0,
    observed: `vite build ${build.code === 0 ? 'passes without resolve.dedupe' : `fails: ${build.output.trim().split('\n')[0]}`}`,
  };
}
