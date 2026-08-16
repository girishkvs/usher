import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '..');
const outDir = join(root, 'dist');
const dev = process.argv.includes('--dev');

const require = createRequire(import.meta.url);
for (const dep of ['mermaid', 'katex', 'markdown-it', 'dompurify', 'highlight.js']) {
  try {
    require.resolve(dep);
  } catch {
    throw new Error(
      `Cannot resolve "${dep}". The VS Code extension reuses the browser renderer, so run "npm install" in the repository root first.`,
    );
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const shared = {
  bundle: true,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'warning',
};

// Extension host: CommonJS, with the vscode module supplied by the runtime.
await build({
  ...shared,
  entryPoints: [join(root, 'src/extension.ts')],
  outfile: join(outDir, 'extension.cjs'),
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
});

// Enhancements injected into VS Code's own Markdown preview.
await build({
  ...shared,
  entryPoints: [join(root, 'src/preview/diagrams.ts')],
  outfile: join(outDir, 'preview.js'),
  format: 'iife',
  platform: 'browser',
  target: ['chrome128'],
});

// The Usher preview panel: the same renderer the browser extension ships.
await build({
  ...shared,
  entryPoints: [join(root, 'src/webview/main.ts')],
  outfile: join(outDir, 'webview.js'),
  format: 'iife',
  platform: 'browser',
  target: ['chrome128'],
  // Escaping non-ASCII keeps these bundles identical in spirit to the browser build,
  // where a stray U+FFFF sentinel once broke script injection outright.
  charset: 'ascii',
});

// Mermaid and KaTeX stay lazy, exactly as in the browser extension.
await build({
  ...shared,
  entryPoints: [
    { in: join(repo, 'src/vendor/mermaid-entry.ts'), out: 'vendor/mermaid' },
    { in: join(repo, 'src/vendor/katex-entry.ts'), out: 'vendor/katex' },
  ],
  outdir: outDir,
  format: 'iife',
  platform: 'browser',
  target: ['chrome128'],
  charset: 'ascii',
});

await cp(join(repo, 'public/styles'), join(outDir, 'styles'), { recursive: true });
await cp(join(root, 'media/preview.css'), join(outDir, 'preview.css'));

const katexDist = join(repo, 'node_modules/katex/dist');
if (existsSync(katexDist)) {
  const target = join(outDir, 'vendor/katex');
  await mkdir(target, { recursive: true });
  await cp(join(katexDist, 'katex.min.css'), join(target, 'katex.min.css'));
  await cp(join(katexDist, 'fonts'), join(target, 'fonts'), { recursive: true });
}

console.log(`Usher for VS Code built to vscode/dist${dev ? ' (dev)' : ''}`);
