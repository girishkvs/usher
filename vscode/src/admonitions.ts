import type { MarkdownIt, StateBlock, Token } from 'markdown-it';
import { scanContainer } from '../../src/core/container-scan.js';

/** Container names the built-in renderers own. Usher must not touch these. */
const RESERVED = new Set(['mermaid', 'mmd', 'math', 'katex', 'latex', 'tex']);

const ADMONITIONS: Record<string, string> = {
  note: 'Note',
  info: 'Note',
  tip: 'Tip',
  hint: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
  danger: 'Caution',
  error: 'Caution',
};

/** The class suffix that drives colour, so `info` and `note` look identical. */
const KIND: Record<string, string> = {
  note: 'note',
  info: 'note',
  tip: 'tip',
  hint: 'tip',
  important: 'important',
  warning: 'warning',
  caution: 'caution',
  danger: 'caution',
  error: 'caution',
};

/**
 * Renders `:::note ... :::` containers as callouts.
 *
 * Azure DevOps wikis and Docusaurus both use this syntax; markdown-it would otherwise
 * emit the marker lines as literal text. Mermaid and math containers are deliberately
 * left alone: VS Code has shipped its own renderers for those since 1.121, and claiming
 * them here would produce exactly the duplicate-renderer conflict this extension exists
 * to avoid.
 */
export function admonitionsPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    'fence',
    'usher_admonition',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const scan = scanContainer(state, startLine, endLine);
      if (!scan) {
        return false;
      }
      if (RESERVED.has(scan.name) ||
          !ADMONITIONS[scan.name]) {
        return false;
      }
      if (silent) {
        return true;
      }

      const { markers, name, rest, contentEnd, closed } = scan;
      const kind = KIND[name];

      const open = state.push('usher_admonition_open', 'div', 1);
      open.markup = ':'.repeat(markers);
      open.map = [startLine, contentEnd];
      open.attrSet('class', `usher-admonition usher-admonition-${kind}`);

      const titleOpen = state.push('usher_admonition_title_open', 'p', 1);
      titleOpen.attrSet('class', 'usher-admonition-title');
      const titleText = state.push('text', '', 0);
      titleText.content = rest || ADMONITIONS[name];
      state.push('usher_admonition_title_close', 'p', -1);

      const savedMax = state.lineMax;
      state.lineMax = contentEnd;
      state.md.block.tokenize(state, startLine + 1, contentEnd);
      state.lineMax = savedMax;

      state.push('usher_admonition_close', 'div', -1).markup = ':'.repeat(markers);
      state.line = closed ? contentEnd + 1 : contentEnd;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );
}

/**
 * The preview webview cannot read settings directly, so they ride along in the
 * rendered HTML.
 *
 * This has to wrap `md.renderer.render` rather than `md.render`: VS Code parses and
 * renders in separate steps, so a wrapper on `md.render` is never called and the
 * settings silently never arrive.
 */
export function configPlugin(md: MarkdownIt, readConfig: () => object): void {
  const renderer = md.renderer;
  const original = renderer.render.bind(renderer);
  renderer.render = ((...args: Parameters<typeof original>) => {
    const config = escapeAttribute(JSON.stringify(readConfig()));
    return `<span id="usher-config" aria-hidden="true" data-config="${config}"></span>\n${original(...args)}`;
  }) as typeof renderer.render;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export type { Token };
