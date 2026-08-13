import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards two things the browser only complains about at runtime:
 *
 * 1. chrome.scripting.executeScript rejects a file unless it passes a strict
 *    UTF-8 check that also rejects non-characters such as U+FFFF and unpaired
 *    surrogates. Mermaid ships a U+FFFF sentinel, so the bundles are built with
 *    charset 'ascii' and verified here. esbuild cannot escape inside regular
 *    expression literals, so this is a real check rather than an assumption.
 * 2. A manifest that points at a missing file loads with no error until the
 *    feature is used.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const problems = [];

function listFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(full));
    } else {
      found.push(full);
    }
  }
  return found;
}

if (!existsSync(dist)) {
  console.error('dist/ is missing -- run npm run build first.');
  process.exit(1);
}

for (const file of listFiles(dist).filter((name) => name.endsWith('.js'))) {
  const buffer = readFileSync(file);
  const name = relative(dist, file).replace(/\\/g, '/');

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    problems.push(`${name}: not valid UTF-8`);
    continue;
  }

  // Chromium's check rejects Unicode non-characters and unpaired surrogates even
  // though they encode cleanly. Mermaid contains a U+FFFF sentinel, which broke
  // chrome.scripting.executeScript until the bundles were built as ASCII.
  const text = buffer.toString('utf8');
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const isSurrogate = code >= 0xd800 && code <= 0xdfff;
    const isNonCharacter = (code & 0xfffe) === 0xfffe || (code >= 0xfdd0 && code <= 0xfdef);
    if (isNonCharacter || isSurrogate) {
      const paired =
        isSurrogate &&
        code <= 0xdbff &&
        text.charCodeAt(index + 1) >= 0xdc00 &&
        text.charCodeAt(index + 1) <= 0xdfff;
      if (paired) {
        index += 1;
        continue;
      }
      problems.push(
        `${name}: U+${code.toString(16).toUpperCase()} at offset ${index} will be rejected by executeScript`,
      );
      break;
    }
  }
}

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const referenced = new Set([
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap((script) => script.js),
  ...manifest.declarative_net_request.rule_resources.map((resource) => resource.path),
  'renderer.js',
  'viewer.html',
  'viewer.js',
  'options.js',
  'popup.js',
  'vendor/mermaid.js',
  'vendor/katex.js',
  'vendor/katex/katex.min.css',
  'styles/usher.css',
  'styles/ui.css',
  'THIRD-PARTY-NOTICES.txt',
]);

for (const target of referenced) {
  if (!existsSync(join(dist, target))) {
    problems.push(`manifest or code references a missing file: ${target}`);
  }
}

const rules = JSON.parse(readFileSync(join(dist, 'rules.json'), 'utf8'));
const ids = new Set();
for (const rule of rules) {
  if (ids.has(rule.id)) {
    problems.push(`duplicate declarativeNetRequest rule id: ${rule.id}`);
  }
  ids.add(rule.id);
  if (!rule.condition?.resourceTypes?.includes('main_frame')) {
    problems.push(`rule ${rule.id} is not limited to main_frame`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`FAIL  ${problem}`);
  }
  process.exit(1);
}

console.log('Bundle checks passed: scripts are injectable, no missing files, rules well formed.');
