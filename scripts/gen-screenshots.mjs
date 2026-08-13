#!/usr/bin/env node
// Renders the store assets: screenshots at the sizes Chrome and Edge require, plus the
// promotional tiles and the square store logo. Everything is captured from the real
// extension in a real browser, so the listing always matches what ships.
//
//   npm run build && npm run screenshots
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SHOWCASE = join(ROOT, 'samples', 'showcase.md');
const OUT = join(ROOT, 'build', 'store');

const CHROME_SIZE = { width: 1280, height: 800 };
const EDGE_SIZE = { width: 1366, height: 768 };

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function findBrowser() {
  return process.env.USHER_BROWSER ?? CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

function startServer() {
  const body = readFileSync(SHOWCASE);
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
    response.end(body);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

async function openExtensionPage(context, driver, path) {
  await driver.evaluate(async (target) => {
    const [window] = await chrome.windows.getAll({});
    await chrome.tabs.create({ url: chrome.runtime.getURL(target), windowId: window?.id });
  }, path);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const page = context.pages().find((candidate) => candidate.url().includes(path));
    if (page) {
      await page.waitForLoadState('domcontentloaded');
      return page;
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`the extension did not open ${path}`);
}

async function setTheme(page, theme) {
  await page.evaluate(async (value) => {
    const stored = await chrome.storage.sync.get('usher.settings');
    await chrome.storage.sync.set({ 'usher.settings': { ...(stored['usher.settings'] ?? {}), theme: value } });
  }, theme);
  await page.waitForTimeout(3500);
}

/** The promotional tiles are laid out in HTML so they use real type rather than a bitmap font. */
function promoMarkup(iconDataUri, { wordSize, tagSize, gap, showTag }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: ${gap}px;
    background: linear-gradient(135deg, #2dd4bf 0%, #14b8a6 45%, #0d7680 100%);
    font-family: 'Segoe UI Variable Display', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    color: #fff;
  }
  .row { display: flex; align-items: center; gap: ${Math.round(wordSize * 0.42)}px; }
  img { width: ${Math.round(wordSize * 1.15)}px; height: ${Math.round(wordSize * 1.15)}px; border-radius: ${Math.round(wordSize * 0.26)}px; box-shadow: 0 ${Math.round(wordSize * 0.08)}px ${Math.round(wordSize * 0.3)}px rgba(6, 46, 50, 0.35); }
  .word { font-size: ${wordSize}px; font-weight: 650; letter-spacing: -0.02em; line-height: 1; }
  .tag { font-size: ${tagSize}px; font-weight: 400; letter-spacing: 0.02em; opacity: 0.92; text-align: center; }
</style></head>
<body>
  <div class="row"><img src="${iconDataUri}" alt=""><div class="word">Usher</div></div>
  ${showTag ? '<div class="tag">Markdown &amp; Mermaid, everywhere</div>' : ''}
</body></html>`;
}

async function main() {
  if (!existsSync(join(DIST, 'manifest.json'))) {
    console.error('dist/ is missing -- run "npm run build" first.');
    process.exit(1);
  }
  const browserPath = findBrowser();
  if (!browserPath) {
    console.error('No Chrome or Edge found. Set USHER_BROWSER to a browser executable.');
    process.exit(1);
  }
  const useCdpLoad = /chrome(\.exe)?$|Google Chrome$/i.test(browserPath);

  mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  const profile = mkdtempSync(join(tmpdir(), 'usher-shots-'));
  const written = [];

  const context = await chromium.launchPersistentContext(profile, {
    executablePath: browserPath,
    headless: false,
    viewport: CHROME_SIZE,
    deviceScaleFactor: 1,
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
    args: useCdpLoad
      ? ['--no-first-run', '--no-default-browser-check', '--test-type', '--enable-unsafe-extension-debugging']
      : [
          `--disable-extensions-except=${DIST}`,
          `--load-extension=${DIST}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-features=msEdgeIdentityFre,msImplicitSignin',
        ],
  });

  const shoot = async (page, name, size) => {
    await page.setViewportSize(size);
    await page.waitForTimeout(700);
    const file = join(OUT, name);
    await page.screenshot({ path: file });
    written.push(`${name}  ${size.width}x${size.height}`);
  };

  try {
    if (useCdpLoad) {
      const session = await context.browser().newBrowserCDPSession();
      await session.send('Extensions.loadUnpacked', { path: DIST });
    }
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
    }

    const primer = await context.newPage();
    await primer.goto('about:blank');
    const viewer = await openExtensionPage(context, worker, 'viewer.html');

    // 1 and 2: a rendered document, light and dark.
    const doc = await context.newPage();
    await doc.goto(`http://127.0.0.1:${port}/showcase.md`);
    await doc.waitForSelector('.usher-diagram-canvas > svg', { timeout: 30000 });
    await doc.waitForTimeout(1500);
    for (const [size, prefix] of [
      [CHROME_SIZE, ''],
      [EDGE_SIZE, 'edge-'],
    ]) {
      await shoot(doc, `${prefix}screenshot-1.png`, size);
    }

    // 3: the diagram, scrolled into view.
    await doc.evaluate(() => document.querySelector('figure.usher-diagram')?.scrollIntoView({ block: 'center' }));
    await doc.waitForTimeout(600);
    await shoot(doc, 'screenshot-3.png', CHROME_SIZE);
    await shoot(doc, 'edge-screenshot-3.png', EDGE_SIZE);

    await setTheme(viewer, 'dark');
    await doc.bringToFront();
    await doc.waitForTimeout(1200);
    await shoot(doc, 'screenshot-2.png', CHROME_SIZE);
    await shoot(doc, 'edge-screenshot-2.png', EDGE_SIZE);
    await setTheme(viewer, 'auto');

    // 4: the viewer with its editor open.
    await viewer.bringToFront();
    await viewer.evaluate(() => document.getElementById('toggle-editor').click());
    await viewer.waitForTimeout(400);
    await viewer.fill('#editor', readFileSync(SHOWCASE, 'utf8'));
    await viewer.waitForTimeout(2500);
    await viewer.evaluate(() => {
      document.getElementById('editor').scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await viewer.waitForTimeout(400);
    await shoot(viewer, 'screenshot-4.png', CHROME_SIZE);
    await shoot(viewer, 'edge-screenshot-4.png', EDGE_SIZE);

    // 5: settings.
    const options = await openExtensionPage(context, viewer, 'options.html');
    await options.waitForTimeout(1000);
    await shoot(options, 'screenshot-5.png', CHROME_SIZE);
    await shoot(options, 'edge-screenshot-5.png', EDGE_SIZE);

    // Promotional tiles and the store logo.
    const icon = readFileSync(join(DIST, 'assets', 'icon-128.png')).toString('base64');
    const iconDataUri = `data:image/png;base64,${icon}`;
    const promo = await context.newPage();
    const tiles = [
      { name: 'promo-440x280.png', width: 440, height: 280, wordSize: 58, tagSize: 17, gap: 20, showTag: true },
      { name: 'promo-1400x560.png', width: 1400, height: 560, wordSize: 150, tagSize: 44, gap: 48, showTag: true },
      { name: 'logo-300.png', width: 300, height: 300, wordSize: 0, tagSize: 0, gap: 0, showTag: false },
    ];
    for (const tile of tiles) {
      await promo.setViewportSize({ width: tile.width, height: tile.height });
      if (tile.name === 'logo-300.png') {
        await promo.setContent(
          `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2dd4bf,#0d7680)}img{width:230px;height:230px;border-radius:56px;box-shadow:0 18px 48px rgba(6,46,50,.35)}</style></head><body><img src="${iconDataUri}" alt=""></body></html>`,
        );
      } else {
        await promo.setContent(promoMarkup(iconDataUri, tile));
      }
      await promo.waitForTimeout(400);
      const file = join(OUT, tile.name);
      await promo.screenshot({ path: file });
      written.push(`${tile.name}  ${tile.width}x${tile.height}`);
    }
  } finally {
    await context.close();
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }

  console.log(`Store assets written to ${OUT}`);
  for (const line of written.sort()) {
    console.log(`  ${line}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
