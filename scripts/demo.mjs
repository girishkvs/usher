// Opens the built extension in a real browser and leaves it open so the change can be
// looked at. Run: node scripts/demo.mjs   (after "npm run build")
import { chromium } from 'playwright-core';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/ is missing -- run "npm run build" first.');
  process.exit(1);
}
const executablePath = process.env.USHER_BROWSER ?? CANDIDATES.find((c) => existsSync(c));
if (!executablePath) {
  console.error('No Chrome found. Set USHER_BROWSER.');
  process.exit(1);
}

// A document long enough that jumping to the bottom is worth doing.
const demo = join(root, 'vscode', 'media', 'demo.md');
const body = readFileSync(demo, 'utf8');
const filler = Array.from({ length: 40 }, (_, i) =>
  [`## Filler section ${i + 1}`, '', 'Text so the document is long enough to scroll through.', '',
   '- one', '- two', '', '```ts', `const n = ${i};`, '```', ''].join('\n'),
).join('\n');
const sample = join(mkdtempSync(join(tmpdir(), 'usher-demo-')), 'demo.md');
writeFileSync(sample, `${body}\n\n${filler}\n## The end\n\nYou reached the bottom.\n`, 'utf8');

const profile = mkdtempSync(join(tmpdir(), 'usher-demo-profile-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath,
  headless: false,
  viewport: null,
  ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
  args: ['--no-first-run', '--no-default-browser-check', '--test-type', '--enable-unsafe-extension-debugging'],
});

const session = await context.browser().newBrowserCDPSession();
await session.send('Extensions.loadUnpacked', { path: dist });

let [worker] = context.serviceWorkers();
if (!worker) {
  worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
}
const extensionId = new URL(worker.url()).host;
console.log(`extension loaded: ${extensionId}`);

// viewer.html is not web-accessible, so it has to be opened by the extension itself.
await worker.evaluate(async (target) => {
  const [window] = await chrome.windows.getAll({});
  await chrome.tabs.create({ url: chrome.runtime.getURL(target), windowId: window?.id });
}, 'viewer.html');

for (let i = 0; i < 60; i += 1) {
  const page = context.pages().find((p) => p.url().includes('viewer.html'));
  if (page) {
    await page.waitForLoadState('domcontentloaded');
    await page.bringToFront();
    console.log('viewer open');
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\nA sample document is at:\n  ${sample}`);
console.log('\nIn the viewer use "Open file" and pick it, or drag it into the window.');
console.log('The up and down controls float against the right edge, beside the scrollbar.');
console.log('\nClose the browser window when you are done. This process stays alive to keep it open.');

await new Promise(() => {});
