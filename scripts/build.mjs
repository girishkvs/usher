import { build, context } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist');
const publicDir = join(root, 'public');

const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

const ENTRIES = [
  { in: 'src/detect.ts', out: 'detect' },
  { in: 'src/renderer.ts', out: 'renderer' },
  { in: 'src/background.ts', out: 'background' },
  { in: 'src/pages/popup.ts', out: 'popup' },
  { in: 'src/pages/options.ts', out: 'options' },
  { in: 'src/pages/viewer.ts', out: 'viewer' },
  { in: 'src/vendor/mermaid-entry.ts', out: 'vendor/mermaid' },
  { in: 'src/vendor/katex-entry.ts', out: 'vendor/katex' },
];

const buildOptions = {
  entryPoints: ENTRIES.map((entry) => ({ in: join(root, entry.in), out: entry.out })),
  outdir: outDir,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome128'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'warning',
  // Chrome rejects script files injected with chrome.scripting.executeScript unless
  // they pass a strict UTF-8 check, which some bundled dependencies fail because of
  // non-character sentinels. Escaping every non-ASCII code point avoids that.
  charset: 'ascii',
  metafile: true,
  define: {
    'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
  },
};

async function copyStaticAssets() {
  const manifest = JSON.parse(await readFile(join(publicDir, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  manifest.version = pkg.version;

  await cp(publicDir, outDir, {
    recursive: true,
    filter: (source) => !source.endsWith(`${join('public', 'manifest.json')}`),
  });
  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const katexDist = join(root, 'node_modules', 'katex', 'dist');
  if (existsSync(katexDist)) {
    const target = join(outDir, 'vendor', 'katex');
    await mkdir(target, { recursive: true });
    await cp(join(katexDist, 'katex.min.css'), join(target, 'katex.min.css'));
    await cp(join(katexDist, 'fonts'), join(target, 'fonts'), { recursive: true });
  }
}

async function reportSizes() {
  const rows = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.css')) {
        const info = await stat(full);
        rows.push({ file: relative(outDir, full).replace(/\\/g, '/'), kb: info.size / 1024 });
      }
    }
  }
  await walk(outDir);
  rows.sort((a, b) => b.kb - a.kb);
  const width = Math.max(...rows.map((row) => row.file.length));
  for (const row of rows) {
    console.log(`  ${row.file.padEnd(width)}  ${row.kb.toFixed(1).padStart(8)} KB`);
  }
  const total = rows.reduce((sum, row) => sum + row.kb, 0);
  console.log(`  ${'total'.padEnd(width)}  ${total.toFixed(1).padStart(8)} KB`);
}

async function run() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    await copyStaticAssets();
    console.log('Usher: watching for changes. Load dist/ as an unpacked extension.');
    return;
  }

  await build(buildOptions).then(async (result) => {
    // The notices generator derives the bundled package list from this, so it reflects
    // exactly what shipped rather than the declared dependency tree.
    await mkdir(join(root, 'build'), { recursive: true });
    await writeFile(join(root, 'build', 'metafile.json'), JSON.stringify(result.metafile));
  });
  await copyStaticAssets();
  console.log(`Usher built to dist/ (${dev ? 'development' : 'production'})`);
  await reportSizes();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
