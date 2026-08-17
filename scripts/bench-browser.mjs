// Measures the whole browser pipeline -- parse, sanitise, highlight, DOM insert and
// Mermaid -- on a large document, because the parser alone is not what a reader waits for.
// Run: node scripts/bench-browser.mjs   (needs "npm run build" in vscode/ first)
import { chromium } from 'playwright-core';
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'vscode', 'dist');

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png' };

function section(i, withDiagram) {
  return [
    `## Section ${i}`,
    '',
    `Paragraph with **bold**, _italic_, \`code\` and a [link](https://example.com/${i}).`,
    '',
    '- item one',
    '- [x] a task',
    '',
    '| Gate | Owner |',
    '|---|---|',
    '| Tests | author |',
    '',
    '```ts',
    `export const value${i} = ${i};`,
    '```',
    '',
    ':::note',
    'A callout.',
    ':::',
    '',
    ...(withDiagram ? [':::mermaid', 'flowchart LR', `    A${i}["Start"] --> B${i}["End"];`, ':::', ''] : []),
  ].join('\n');
}

function document(sections, diagrams) {
  const parts = ['# Benchmark', ''];
  for (let i = 0; i < sections; i += 1) {
    parts.push(section(i, i < diagrams));
  }
  return parts.join('\n');
}

const server = await new Promise((done) => {
  const s = createServer((req, res) => {
    const file = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(dist) ||
        !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  s.listen(0, '127.0.0.1', () => done(s));
});
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const executablePath = process.env.USHER_BROWSER ?? CANDIDATES.find((c) => existsSync(c));
if (!executablePath) {
  console.error('No Chrome found. Set USHER_BROWSER.');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath, headless: true });
console.log('sections  words   diagrams   first paint   fully rendered');

for (const [sections, diagrams] of [[50, 5], [200, 10], [400, 20], [800, 20]]) {
  const source = document(sections, diagrams);
  const words = source.trim().split(/\s+/).length;
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  await page.setContent(
    `<!DOCTYPE html><html><head>
     <link rel="stylesheet" href="${base}/styles/usher.css">
     <link rel="stylesheet" href="${base}/styles/ui.css"></head><body>
     <div id="usher-root" data-base-uri="${base}" data-source-url="bench.md" data-subtitle="bench"
          data-settings="${JSON.stringify({ theme: 'dark' }).replace(/"/g, '&quot;')}"></div>
     <script>window.acquireVsCodeApi=()=>({postMessage(){},getState(){},setState(){}});</script>
     <script src="${base}/webview.js"></script></body></html>`,
    { waitUntil: 'load' },
  );

  const started = Date.now();
  await page.evaluate((text) => window.postMessage({ type: 'update', source: text }, '*'), source);
  await page.waitForSelector('article h1', { timeout: 120000 });
  const firstPaint = Date.now() - started;
  await page.waitForFunction(
    (expected) => document.querySelectorAll('figure svg').length >= expected,
    diagrams,
    { timeout: 180000 },
  );
  const complete = Date.now() - started;

  console.log(
    `${String(sections).padStart(8)}  ${String(words).padStart(6)}  ${String(diagrams).padStart(8)}  ${String(firstPaint + 'ms').padStart(11)}  ${String(complete + 'ms').padStart(14)}`,
  );
  await page.close();
}

await browser.close();
server.close();
