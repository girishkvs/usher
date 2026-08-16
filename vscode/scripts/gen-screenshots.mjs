// Renders the marketplace screenshots by loading the panel's own webview bundle in a
// browser, rather than driving the VS Code UI: modal dialogs and editor layout make
// screenshotting the real window unreliable, and the bundle is what actually renders.
//
//   npm run build && npm run screenshots
import { chromium } from 'playwright-core';
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'media');
const demo = join(root, 'media', 'demo.md');

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];

const TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.html': 'text/html',
};

function startServer() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const file = join(dist, path);
    if (!file.startsWith(dist) ||
        !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

function pageMarkup(port, settings, source) {
  const base = `http://127.0.0.1:${port}`;
  const encoded = JSON.stringify(settings).replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${base}/styles/usher.css">
<link rel="stylesheet" href="${base}/styles/ui.css">
<link rel="stylesheet" href="${base}/vendor/katex/katex.min.css">
<style>html, body { margin: 0; }</style>
</head>
<body>
<div id="usher-root"
     data-base-uri="${base}"
     data-source-url="release-checklist.md"
     data-subtitle="Usher preview"
     data-settings="${encoded}"></div>
<script>
  window.acquireVsCodeApi = () => ({ postMessage() {}, getState() {}, setState() {} });
  window.__usherSource = ${JSON.stringify(source)};
</script>
<script src="${base}/webview.js"></script>
<script>
  window.postMessage({ type: 'update', source: window.__usherSource }, '*');
</script>
</body>
</html>`;
}

async function main() {
  if (!existsSync(join(dist, 'webview.js'))) {
    console.error('dist/ is missing -- run "npm run build" first.');
    process.exit(1);
  }
  const executablePath = process.env.USHER_BROWSER ?? CANDIDATES.find((c) => existsSync(c));
  if (!executablePath) {
    console.error('No Chrome or Edge found. Set USHER_BROWSER to a browser executable.');
    process.exit(1);
  }

  mkdirSync(out, { recursive: true });
  const source = readFileSync(demo, 'utf8');
  const server = await startServer();
  const port = server.address().port;

  const browser = await chromium.launch({ executablePath, headless: true });
  const written = [];

  for (const [name, theme] of [['screenshot-dark.png', 'dark'], ['screenshot-light.png', 'github']]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    // The shell fades content in; without this the capture catches it mid-animation.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setContent(pageMarkup(port, { theme, showToc: true, contentWidth: 'normal', fontSize: 15 }, source), {
      waitUntil: 'load',
    });
    await page.waitForSelector('article h1', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('figure svg').length >= 2, null, { timeout: 30000 });
    await page.waitForFunction(
      () => [...document.querySelectorAll('article h2')].every((h) => getComputedStyle(h).opacity === '1'),
      null,
      { timeout: 15000 },
    ).catch(() => {});
    await page.waitForTimeout(2500);
    const file = join(out, name);
    await page.screenshot({ path: file });
    written.push(`${name}  1440x1000 @2x`);
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(`Wrote ${written.length} screenshots to vscode/media:`);
  for (const line of written) {
    console.log(`  ${line}`);
  }
}

await main();
