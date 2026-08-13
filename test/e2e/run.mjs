#!/usr/bin/env node
// End-to-end suite: loads dist/ into a real browser and exercises the paths that unit tests
// cannot reach -- content-script injection, the network rules, sanitising against a live DOM,
// Mermaid rendering, and file:// documents.
//
// Every bug this suite has caught was invisible to the unit tests: Mermaid needing a DOM-attached
// container, a U+FFFF sentinel making executeScript reject the bundle, DOMPurify stripping
// foreignObject, CSS display overriding the hidden attribute, and the diagram sizing collapse.
//
//   node test/e2e/run.mjs                 # auto-detect a browser
//   USHER_BROWSER=<path> node test/e2e/run.mjs
//   USHER_HEADLESS=1 node test/e2e/run.mjs
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');
const SAMPLE = join(ROOT, 'samples', 'smoke.md');
const SHOTS = process.env.USHER_SHOTS ?? join(ROOT, 'build', 'e2e-shots');

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function findBrowser() {
  if (process.env.USHER_BROWSER) {
    return process.env.USHER_BROWSER;
  }
  return CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

const failures = [];
const notes = [];

function check(name, condition, detail = '') {
  const line = `${name}${detail ? ` -- ${detail}` : ''}`;
  (condition ? notes : failures).push(`${condition ? 'PASS' : 'FAIL'}  ${line}`);
}

/**
 * Serves the sample three ways so the declarativeNetRequest rules are exercised:
 * as text/markdown, as a forced download, and as ordinary text/plain.
 */
function startServer() {
  const body = readFileSync(SAMPLE);
  const server = createServer((request, response) => {
    if (request.url.startsWith('/markdown-content-type')) {
      response.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
    } else if (request.url.startsWith('/octet')) {
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="smoke.md"',
      });
    } else {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    }
    response.end(body);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

/**
 * Opens an extension page the way the product does. Edge refuses an externally
 * initiated navigation to an extension page that is not web-accessible, so the tab
 * has to be created from inside the extension.
 */
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

/**
 * The viewer runs with the extension's host permissions, so it must not be reachable
 * from an ordinary web page. Verified by asking a normal page to fetch it.
 */
async function notWebAccessible(context, extensionId) {
  const probe = await context.newPage();
  try {
    await probe.setContent('<title>probe</title>');
    return await probe.evaluate(async (id) => {
      try {
        const response = await fetch(`chrome-extension://${id}/viewer.html`);
        return !response.ok;
      } catch {
        return true;
      }
    }, extensionId);
  } finally {
    await probe.close();
  }
}

async function main() {
  if (!existsSync(join(DIST, 'manifest.json'))) {
    console.error('dist/ is missing or incomplete -- run "npm run build" first.');
    process.exit(1);
  }
  const browserPath = findBrowser();
  if (!browserPath) {
    console.error('No Chrome or Edge found. Set USHER_BROWSER to a browser executable.');
    process.exit(1);
  }
  // Chrome 137+ removed the --load-extension switch. The supported automation route is the
  // Extensions CDP domain, behind --enable-unsafe-extension-debugging.
  const useCdpLoad = /chrome(\.exe)?$|Google Chrome$/i.test(browserPath);
  console.log(`Browser: ${browserPath}${useCdpLoad ? '  (loading via CDP)' : ''}`);

  mkdirSync(SHOTS, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  const profile = mkdtempSync(join(tmpdir(), 'usher-e2e-'));

  const context = await chromium.launchPersistentContext(profile, {
    executablePath: browserPath,
    headless: process.env.USHER_HEADLESS === '1',
    viewport: { width: 1440, height: 1000 },
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

  try {
    if (useCdpLoad) {
      const session = await context.browser().newBrowserCDPSession();
      await session.send('Extensions.loadUnpacked', { path: DIST });
    }

    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
    }
    const extensionId = new URL(worker.url()).host;
    check('service worker started', Boolean(extensionId), extensionId);

    // --- viewer page ------------------------------------------------------
    // Opened the way the product does. viewer.html is deliberately not web-accessible,
    // so it is only reachable through an extension-initiated navigation.
    const primer = await context.newPage();
    await primer.goto('about:blank');
    const viewer = await openExtensionPage(context, worker, 'viewer.html');
    await viewer.setViewportSize({ width: 1440, height: 1000 });
    await viewer.waitForSelector('.usher-markdown h1', { timeout: 30000 });
    await viewer.waitForSelector('.usher-diagram-canvas > svg', { timeout: 30000 });
    await viewer.waitForTimeout(1200);
    await viewer.screenshot({ path: join(SHOTS, '01-viewer.png') });

    const stats = await viewer.evaluate(() => ({
      headings: document.querySelectorAll('.usher-markdown h1,h2,h3').length,
      toc: document.querySelectorAll('.usher-toc a').length,
      diagrams: document.querySelectorAll('.usher-diagram-canvas > svg').length,
      diagramErrors: document.querySelectorAll('.usher-diagram-error').length,
      diagramTextNodes: document.querySelectorAll('.usher-diagram-canvas > svg text').length,
      diagramText: Array.from(document.querySelectorAll('.usher-diagram-canvas > svg text'))
        .map((n) => n.textContent)
        .join(' '),
      foreignObjects: document.querySelectorAll('.usher-diagram-canvas > svg foreignObject').length,
      highlighted: document.querySelectorAll('pre.usher-code .hljs-keyword, pre.usher-code .hljs-string').length,
      alerts: document.querySelectorAll('.usher-alert').length,
      frontMatter: document.querySelectorAll('.usher-frontmatter tr').length,
      tables: document.querySelectorAll('.usher-table-wrap table').length,
      checkboxes: document.querySelectorAll('input[type=checkbox]').length,
      footnotes: document.querySelectorAll('.footnotes').length,
      editorVisible: !document.getElementById('editor-pane').hidden,
      dropHintVisible: getComputedStyle(document.getElementById('drop-hint')).display !== 'none',
    }));
    notes.push(`viewer: ${JSON.stringify({ ...stats, diagramText: undefined })}`);
    check('renders headings', stats.headings >= 4);
    check('builds a table of contents', stats.toc >= 4);
    check('renders mermaid', stats.diagrams >= 2, `${stats.diagrams} svg`);
    check('no mermaid errors', stats.diagramErrors === 0);
    check('diagram labels are svg text', stats.diagramTextNodes >= 6, `${stats.diagramTextNodes} nodes`);
    check('diagram labels keep their words', /Local \.md file/.test(stats.diagramText));
    check('no foreignObject survives sanitising', stats.foreignObjects === 0);
    check('highlights code', stats.highlighted > 0);
    check('renders alerts', stats.alerts >= 2);
    check('shows front matter', stats.frontMatter >= 2);
    check('renders tables', stats.tables >= 1);
    check('task list checkboxes keep their type', stats.checkboxes >= 2);
    check('renders footnotes', stats.footnotes >= 1);
    check('editor pane starts hidden', stats.editorVisible === false);
    check('drop hint starts hidden', stats.dropHintVisible === false);

    // --- diagram sizing and full screen ------------------------------------
    const sizing = await viewer.evaluate(() => {
      const figure = document.querySelector('figure.usher-diagram');
      const stage = figure.querySelector('.usher-diagram-stage');
      const canvas = figure.querySelector('.usher-diagram-canvas');
      return {
        naturalWidth: canvas.querySelector('svg').viewBox.baseVal.width,
        canvasWidth: canvas.offsetWidth,
        stageWidth: stage.clientWidth,
        scrollable: stage.scrollWidth > stage.clientWidth + 1,
        clamped: figure.dataset.clamped,
      };
    });
    notes.push(`sizing: ${JSON.stringify(sizing)}`);
    const expected = Math.min(1, Math.max(sizing.stageWidth / sizing.naturalWidth, 0.55));
    check(
      'diagram is drawn at the fit scale',
      Math.abs(sizing.canvasWidth - sizing.naturalWidth * expected) <= 2,
      `canvas ${sizing.canvasWidth}, expected ${Math.round(sizing.naturalWidth * expected)}`,
    );
    check('a clamped diagram can be scrolled', sizing.clamped === '0' || sizing.scrollable);

    await viewer.click('figure.usher-diagram .usher-diagram-toolbar button:nth-child(4)');
    await viewer.waitForTimeout(900);
    const fullscreen = await viewer.evaluate(() => {
      const figure = document.querySelector('figure.usher-diagram');
      return { on: figure.dataset.fullscreen === '1', width: figure.getBoundingClientRect().width };
    });
    check('full screen expands the diagram', fullscreen.on && fullscreen.width > 1200, JSON.stringify(fullscreen));
    await viewer.keyboard.press('Escape');
    await viewer.waitForTimeout(800);
    const restored = await viewer.evaluate(() => ({
      out: document.querySelector('figure.usher-diagram').dataset.fullscreen !== '1',
      overflow: document.documentElement.style.overflow,
    }));
    check('escape leaves full screen and restores scrolling', restored.out && restored.overflow === '');

    // --- editor round trip -------------------------------------------------
    await viewer.click('#toggle-editor');
    await viewer.waitForTimeout(400);
    check('editor pane opens', await viewer.evaluate(() => !document.getElementById('editor-pane').hidden));
    await viewer.fill('#editor', '# Live edit\n\n:::mermaid\ngraph TD;\n  X-->Y;\n:::\n\n- [x] typed\n');
    await viewer.waitForTimeout(2500);
    const live = await viewer.evaluate(() => ({
      heading: document.querySelector('.usher-markdown h1')?.textContent?.replace('#', '').trim(),
      diagrams: document.querySelectorAll('.usher-diagram-canvas > svg').length,
      colons: (document.querySelector('.usher-markdown').innerText.match(/:::/g) ?? []).length,
    }));
    check('editor re-renders live', live.heading === 'Live edit', JSON.stringify(live));
    check('container fences render as diagrams', live.diagrams === 1 && live.colons === 0, JSON.stringify(live));
    await viewer.screenshot({ path: join(SHOTS, '02-editor.png') });

    // --- sanitiser behaviour against a live DOM ------------------------------
    // A narrow ALLOWED_URI_REGEXP once stripped relative hrefs, image sources, and
    // ordinary attributes, because DOMPurify applies it to more than URI attributes.
    await viewer.fill(
      '#editor',
      [
        '# Sanitiser',
        '',
        'Links: [rel](guide.md) [dot](./docs/sub.md) [anchor](#sanitiser) [abs](https://example.com/x)',
        '',
        '![img](images/pic.png)',
        '',
        '<table><tr><td colspan="2">wide</td></tr></table>',
        '',
        '<ol start="3"><li>three</li></ol>',
        '',
        '- [x] a task',
        '',
        '<input type="text" name="evil">',
        '<button onclick="window.__pwned=1">click</button>',
        '<a href="javascript:window.__pwned=1">bad</a>',
        '<img src="x" onerror="window.__pwned=1">',
        '<a href="data:text/html,<script>window.__pwned=1</script>">data</a>',
      ].join('\n'),
    );
    await viewer.waitForTimeout(1500);
    const sanitised = await viewer.evaluate(() => {
      const article = document.querySelector('.usher-markdown');
      const hrefOf = (text) =>
        Array.from(article.querySelectorAll('a')).find((a) => a.textContent === text)?.getAttribute('href') ?? null;
      return {
        relative: hrefOf('rel'),
        dotted: hrefOf('dot'),
        anchor: hrefOf('anchor'),
        absolute: hrefOf('abs'),
        javascriptHref: hrefOf('bad'),
        dataHref: hrefOf('data'),
        imgSrc: article.querySelector('img')?.getAttribute('src') ?? null,
        colspan: article.querySelector('td')?.getAttribute('colspan') ?? null,
        olStart: article.querySelector('ol')?.getAttribute('start') ?? null,
        inputs: article.querySelectorAll('input').length,
        taskBoxes: article.querySelectorAll('input[type=checkbox].task-list-item-checkbox').length,
        buttons: article.querySelectorAll('button').length,
        handlers: article.querySelectorAll('[onerror],[onclick]').length,
        pwned: Boolean(window.__pwned),
      };
    });
    notes.push(`sanitiser: ${JSON.stringify(sanitised)}`);
    check('relative links survive', sanitised.relative === 'guide.md', String(sanitised.relative));
    check('dot-relative links survive', sanitised.dotted === './docs/sub.md');
    check('anchors survive', sanitised.anchor === '#sanitiser');
    check('absolute links survive', sanitised.absolute === 'https://example.com/x');
    check('relative image sources survive', sanitised.imgSrc === 'images/pic.png', String(sanitised.imgSrc));
    check('table colspan survives', sanitised.colspan === '2');
    check('ordered list start survives', sanitised.olStart === '3');
    check('javascript: hrefs are removed', sanitised.javascriptHref === null);
    check('data: document hrefs are removed', sanitised.dataHref === null);
    check('only task-list checkboxes survive', sanitised.inputs === 1 && sanitised.taskBoxes === 1, JSON.stringify(sanitised));
    check('buttons from markdown are removed', sanitised.buttons === 0);
    check('inline event handlers are removed', sanitised.handlers === 0 && sanitised.pwned === false);

    // --- markdown served over http -----------------------------------------
    const web = await context.newPage();
    await web.goto(`http://127.0.0.1:${port}/markdown-content-type/smoke.md`);
    await web.waitForSelector('.usher-markdown', { timeout: 30000 });
    await web.waitForTimeout(2500);
    await web.screenshot({ path: join(SHOTS, '03-http.png') });
    const webStats = await web.evaluate(() => ({
      rendered: document.documentElement.dataset.usherRendered,
      contentType: document.contentType,
      diagrams: document.querySelectorAll('.usher-diagram-canvas > svg').length,
      pwned: Boolean(window.__pwned),
      scripts: document.querySelectorAll('.usher-markdown script').length,
      inlineHandlers: document.querySelectorAll('.usher-markdown [onerror]').length,
      keptDiv: document.querySelectorAll('.usher-markdown div.kept').length,
    }));
    notes.push(`http: ${JSON.stringify(webStats)}`);
    check('text/markdown is rewritten to text/plain', webStats.contentType === 'text/plain', webStats.contentType);
    check('http page renders', webStats.rendered === '1');
    check('http page renders mermaid', webStats.diagrams >= 2);
    check('inline script is stripped', webStats.pwned === false && webStats.scripts === 0);
    check('inline event handlers are stripped', webStats.inlineHandlers === 0);
    check('benign html survives', webStats.keptDiv === 1);

    // --- forced download ----------------------------------------------------
    const octet = await context.newPage();
    let downloaded = false;
    octet.on('download', () => {
      downloaded = true;
    });
    await octet.goto(`http://127.0.0.1:${port}/octet.md`).catch(() => {});
    await octet.waitForTimeout(3000);
    const octetRendered = await octet
      .evaluate(() => document.documentElement.dataset.usherRendered === '1')
      .catch(() => false);
    check('an attachment is turned into a rendered page', octetRendered && !downloaded, `downloaded=${downloaded}`);

    // --- extensionless url, and a plain text file that must be left alone ----
    const probe = await context.newPage();
    await probe.goto(`http://127.0.0.1:${port}/markdown-content-type/api/doc`).catch(() => {});
    await probe.waitForTimeout(4000);
    check(
      'extensionless text/markdown renders via the content-type probe',
      await probe.evaluate(() => document.documentElement.dataset.usherRendered === '1').catch(() => false),
    );

    const plain = await context.newPage();
    await plain.goto(`http://127.0.0.1:${port}/plain/notes.txt`).catch(() => {});
    await plain.waitForTimeout(3000);
    check(
      'a plain .txt page is left alone in extension mode',
      !(await plain.evaluate(() => document.documentElement.dataset.usherRendered === '1').catch(() => false)),
    );

    // --- page commands and theming ------------------------------------------
    await web.keyboard.press('r');
    await web.waitForTimeout(400);
    check('raw toggle works', await web.evaluate(() => document.querySelector('.usher-app')?.dataset.usherRaw === '1'));
    await web.screenshot({ path: join(SHOTS, '04-raw.png') });
    await web.keyboard.press('r');
    await web.waitForTimeout(300);

    await web.keyboard.press('t');
    await web.waitForTimeout(300);
    check('toc toggle works', await web.evaluate(() => document.querySelector('.usher-app')?.dataset.usherToc === '0'));
    await web.keyboard.press('t');
    await web.waitForTimeout(300);

    // The service worker may have been terminated by now, so drive storage from an
    // extension page instead of a possibly-stale worker handle.
    await viewer.evaluate(async () => {
      const stored = await chrome.storage.sync.get('usher.settings');
      await chrome.storage.sync.set({
        'usher.settings': { ...(stored['usher.settings'] ?? {}), theme: 'dark' },
      });
    });
    await web.waitForTimeout(4000);
    check('dark theme applies', (await web.evaluate(() => document.documentElement.dataset.usherDark)) === '1');
    await web.screenshot({ path: join(SHOTS, '05-dark.png') });

    // --- extension pages ------------------------------------------------------
    const popup = await openExtensionPage(context, viewer, 'popup.html');
    await popup.waitForTimeout(1200);
    await popup.screenshot({ path: join(SHOTS, '06-popup.png') });
    check('popup renders', (await popup.locator('#render').count()) === 1);

    const options = await openExtensionPage(context, viewer, 'options.html');
    await options.waitForTimeout(1200);
    await options.screenshot({ path: join(SHOTS, '07-options.png'), fullPage: true });
    check('options renders', (await options.locator('[data-setting="mode"]').count()) === 1);

    const notices = await openExtensionPage(context, viewer, 'THIRD-PARTY-NOTICES.txt');
    const noticeText = await notices.evaluate(() => document.body.innerText);
    check(
      'third-party notices ship and name the bundled packages',
      noticeText.includes('THIRD-PARTY NOTICES') && noticeText.includes('mermaid') && noticeText.includes('MIT'),
      `${noticeText.length} chars`,
    );

    check('viewer.html is not reachable from the open web', await notWebAccessible(context, extensionId));

    // --- local file -------------------------------------------------------------
    const local = await context.newPage();
    await local.goto(`file:///${SAMPLE.replace(/\\/g, '/')}`);
    await local.waitForTimeout(3500);
    const localRendered = await local.evaluate(() => document.documentElement.dataset.usherRendered === '1');
    if (localRendered) {
      await local.screenshot({ path: join(SHOTS, '08-file.png') });
    }
    check('file:// renders (needs "Allow access to file URLs")', localRendered);
  } catch (error) {
    failures.push(`FAIL  harness error -- ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  } finally {
    await context.close();
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }

  console.log('');
  for (const note of notes) {
    console.log(note);
  }
  for (const failure of failures) {
    console.log(failure);
  }
  console.log(`\nScreenshots: ${SHOTS}`);
  console.log(failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
