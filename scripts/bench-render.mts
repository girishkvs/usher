// Measures the markdown pipeline across document sizes to see whether cost grows
// linearly. Run: node --import tsx scripts/bench-render.mts
import { performance } from 'node:perf_hooks';
import { createMarkdown } from '../src/core/markdown.ts';
import { DEFAULT_SETTINGS } from '../src/shared/settings.ts';

const md = createMarkdown({ settings: DEFAULT_SETTINGS });

function section(index: number): string {
  return [
    `## Section ${index}`,
    '',
    `Paragraph with **bold**, _italic_, \`code\`, and a [link](https://example.com/${index}).`,
    '',
    '- item one',
    '- item two',
    '- [x] a task',
    '',
    '| Gate | Owner | Blocking |',
    '|---|---|---|',
    '| Unit tests | author | yes |',
    '| Soak | on-call | yes |',
    '',
    '```ts',
    `export const value${index} = ${index};`,
    '```',
    '',
    ':::note',
    'A callout with a nested list:',
    '',
    '- nested one',
    '- nested two',
    ':::',
    '',
    '> [!WARNING]',
    '> A GitHub alert.',
    '',
    ':::mermaid',
    'flowchart LR',
    `    A${index}["Start"] --> B${index}["End"];`,
    ':::',
    '',
  ].join('\n');
}

function document(sections: number): string {
  const parts = ['# Benchmark document', ''];
  for (let i = 0; i < sections; i += 1) {
    parts.push(section(i));
  }
  return parts.join('\n');
}

const sizes = [10, 50, 100, 200, 400, 800];
const rows: { sections: number; words: number; kb: number; ms: number; usPerWord: number }[] = [];

for (const sections of sizes) {
  const source = document(sections);
  const words = source.trim().split(/\s+/).length;

  md.render(source);           // warm the caches so the first size is not penalised
  const runs = sections > 200 ? 3 : 5;
  const started = performance.now();
  for (let i = 0; i < runs; i += 1) {
    md.render(source);
  }
  const ms = (performance.now() - started) / runs;

  rows.push({
    sections,
    words,
    kb: Math.round(source.length / 1024),
    ms: Math.round(ms * 10) / 10,
    usPerWord: Math.round((ms * 1000) / words),
  });
}

console.log('sections  words    size    render      per 1k words');
for (const r of rows) {
  console.log(
    `${String(r.sections).padStart(8)}  ${String(r.words).padStart(6)}  ${String(r.kb + 'KB').padStart(6)}  ${String(r.ms + 'ms').padStart(8)}  ${String(Math.round(r.usPerWord)) + 'us'}`.padEnd(60),
  );
}

// Linear cost means the per-word figure stays flat as the document grows.
const first = rows[0].usPerWord;
const last = rows[rows.length - 1].usPerWord;
const growth = last / first;
console.log(`\nper-word cost changed by ${growth.toFixed(2)}x between the smallest and largest document`);
console.log(growth < 2 ? 'VERDICT: scales linearly' : 'VERDICT: superlinear -- worth investigating');
