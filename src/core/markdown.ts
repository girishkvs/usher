import MarkdownItFactory from 'markdown-it';
import type { MarkdownIt, StateBlock, StateCore, StateInline, Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import deflist from 'markdown-it-deflist';
import taskLists from 'markdown-it-task-lists';
import { full as emoji } from 'markdown-it-emoji';
import { slugify } from '../shared/slug.js';
import { scanContainer } from './container-scan.js';
import type { Settings } from '../shared/settings.js';

export const MERMAID_CLASS = 'usher-mermaid';
export const MATH_BLOCK_CLASS = 'usher-math-block';
export const MATH_INLINE_CLASS = 'usher-math-inline';

const ALERT_KINDS: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
};

const ALERT_PATTERN = /^\[!([A-Za-z]+)\][ \t]*\r?\n?/;

/**
 * GitHub alert callouts: a blockquote whose first line is `[!NOTE]` becomes a
 * styled callout. The marker line is removed and replaced by a title element.
 */
function alertsPlugin(md: MarkdownIt): void {
  md.core.ruler.after('block', 'usher_alerts', (state: StateCore) => {
    const tokens = state.tokens;
    for (let index = 0; index < tokens.length - 2; index += 1) {
      if (tokens[index].type !== 'blockquote_open' ||
          tokens[index + 1].type !== 'paragraph_open') {
        continue;
      }
      const inline = tokens[index + 2];
      if (inline.type !== 'inline') {
        continue;
      }
      const match = ALERT_PATTERN.exec(inline.content);
      if (!match) {
        continue;
      }
      const kind = match[1].toUpperCase();
      const label = ALERT_KINDS[kind];
      if (!label) {
        continue;
      }

      inline.content = inline.content.slice(match[0].length);
      if (inline.children &&
          inline.children.length > 0) {
        const [first] = inline.children;
        if (first.type === 'text') {
          first.content = first.content.replace(ALERT_PATTERN, '');
        }
        while (inline.children.length > 0 && inline.children[0].type === 'softbreak') {
          inline.children.shift();
        }
      }

      tokens[index].attrJoin('class', `usher-alert usher-alert-${kind.toLowerCase()}`);

      const titleOpen = new state.Token('usher_alert_title_open', 'p', 1);
      titleOpen.attrSet('class', 'usher-alert-title');
      titleOpen.attrSet('data-kind', kind.toLowerCase());
      const titleText = new state.Token('text', '', 0);
      titleText.content = label;
      const titleClose = new state.Token('usher_alert_title_close', 'p', -1);
      tokens.splice(index + 1, 0, titleOpen, titleText, titleClose);
      index += 3;

      if (inline.content.trim() === '' &&
          (!inline.children || inline.children.length === 0)) {
        tokens.splice(index + 1, 3);
      }
    }
    return true;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MERMAID_LANGUAGES = new Set(['mermaid', 'mmd']);
const MATH_LANGUAGES = new Set(['math', 'katex', 'latex']);

/** Mermaid sources stay as plain text so they can be rendered after sanitising. */
function mermaidHtml(code: string): string {
  return `<pre class="${MERMAID_CLASS}" data-usher-pending="1"><code>${escapeHtml(code)}</code></pre>`;
}

function mathBlockHtml(code: string): string {
  return `<div class="${MATH_BLOCK_CLASS}"><code>${escapeHtml(code)}</code></div>`;
}

/** Docusaurus and Azure DevOps admonition names mapped onto the alert styles. */
const CONTAINER_ALERTS: Record<string, string> = {
  note: 'NOTE',
  info: 'NOTE',
  tip: 'TIP',
  important: 'IMPORTANT',
  warning: 'WARNING',
  caution: 'CAUTION',
  danger: 'CAUTION',
  error: 'CAUTION',
};

/**
 * Fenced containers -- `:::mermaid ... :::`. Azure DevOps wikis, GitLab, and
 * Docusaurus all use this instead of a code fence, and markdown-it would
 * otherwise swallow the whole block as a paragraph.
 */
function containerPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    'fence',
    'usher_container',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const scan = scanContainer(state, startLine, endLine);
      if (!scan) {
        return false;
      }
      if (silent) {
        return true;
      }

      const { markers, name, rest, contentEnd, closed } = scan;

      if (MERMAID_LANGUAGES.has(name) ||
          MATH_LANGUAGES.has(name)) {
        const token = state.push(
          MERMAID_LANGUAGES.has(name) ? 'usher_container_mermaid' : 'usher_container_math',
          'div',
          0,
        );
        token.content = state.getLines(startLine + 1, contentEnd, state.sCount[startLine], false);
        token.markup = ':'.repeat(markers);
        token.map = [startLine, contentEnd];
        state.line = closed ? contentEnd + 1 : contentEnd;
        return true;
      }

      const alertKind = CONTAINER_ALERTS[name];
      const open = state.push('usher_container_open', 'div', 1);
      open.markup = ':'.repeat(markers);
      open.map = [startLine, contentEnd];
      open.attrSet(
        'class',
        alertKind ? `usher-alert usher-alert-${alertKind.toLowerCase()}` : `usher-container usher-container-${name.replace(/[^a-z0-9-]/g, '')}`,
      );

      if (alertKind) {
        const titleOpen = state.push('usher_alert_title_open', 'p', 1);
        titleOpen.attrSet('class', 'usher-alert-title');
        titleOpen.attrSet('data-kind', alertKind.toLowerCase());
        const titleText = state.push('text', '', 0);
        titleText.content = rest || ALERT_KINDS[alertKind];
        state.push('usher_alert_title_close', 'p', -1);
      }

      const savedMax = state.lineMax;
      state.lineMax = contentEnd;
      state.md.block.tokenize(state, startLine + 1, contentEnd);
      state.lineMax = savedMax;

      const close = state.push('usher_container_close', 'div', -1);
      close.markup = ':'.repeat(markers);
      state.line = closed ? contentEnd + 1 : contentEnd;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );

  md.renderer.rules.usher_container_mermaid = (tokens: Token[], index: number) =>
    mermaidHtml(tokens[index].content);
  md.renderer.rules.usher_container_math = (tokens: Token[], index: number) =>
    mathBlockHtml(tokens[index].content);
}

/**
 * Math is emitted as plain text inside a marked element rather than pre-rendered
 * HTML, so it survives sanitisation and KaTeX can be loaded lazily afterwards.
 */
function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('escape', 'usher_math_inline', (state: StateInline, silent: boolean) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x24 /* $ */) {
      return false;
    }
    if (start > 0 &&
        state.src.charCodeAt(start - 1) === 0x5c /* \ */) {
      return false;
    }
    const next = state.src.charCodeAt(start + 1);
    if (Number.isNaN(next) ||
        next === 0x24 ||
        next === 0x20 ||
        next === 0x0a) {
      return false;
    }

    let pos = start + 1;
    while (pos < state.posMax) {
      const code = state.src.charCodeAt(pos);
      if (code === 0x24 &&
          state.src.charCodeAt(pos - 1) !== 0x5c) {
        break;
      }
      if (code === 0x0a) {
        return false;
      }
      pos += 1;
    }
    if (pos >= state.posMax ||
        pos === start + 1) {
      return false;
    }

    const content = state.src.slice(start + 1, pos);
    if (!silent) {
      const token = state.push('usher_math_inline', 'span', 0);
      token.content = content;
      token.markup = '$';
    }
    state.pos = pos + 1;
    return true;
  });

  md.block.ruler.before(
    'fence',
    'usher_math_block',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      if (start + 2 > max ||
          state.src.slice(start, start + 2) !== '$$') {
        return false;
      }
      if (silent) {
        return true;
      }

      const firstLineTail = state.src.slice(start + 2, max).trim();
      let line = startLine;
      let content = '';
      if (firstLineTail.endsWith('$$') &&
          firstLineTail.length > 2) {
        content = firstLineTail.slice(0, -2);
      } else {
        const parts: string[] = firstLineTail.length > 0 ? [firstLineTail] : [];
        line += 1;
        let closed = false;
        while (line < endLine) {
          const lineStart = state.bMarks[line] + state.tShift[line];
          const lineEnd = state.eMarks[line];
          const text = state.src.slice(lineStart, lineEnd);
          if (text.trim() === '$$') {
            closed = true;
            break;
          }
          parts.push(text);
          line += 1;
        }
        if (!closed) {
          return false;
        }
        content = parts.join('\n');
      }

      const token = state.push('usher_math_block', 'div', 0);
      token.content = content;
      token.map = [startLine, line + 1];
      token.markup = '$$';
      state.line = line + 1;
      return true;
    },
    { alt: ['paragraph', 'blockquote'] },
  );

  md.renderer.rules.usher_math_inline = (tokens: Token[], index: number) =>
    `<code class="${MATH_INLINE_CLASS}">${escapeHtml(tokens[index].content)}</code>`;
  md.renderer.rules.usher_math_block = (tokens: Token[], index: number) =>
    `<div class="${MATH_BLOCK_CLASS}"><code>${escapeHtml(tokens[index].content)}</code></div>`;
}

export interface HighlightFn {
  (code: string, language: string): string | null;
}

export interface MarkdownOptions {
  settings: Settings;
  highlight?: HighlightFn;
}

/**
 * Fenced blocks are rendered here rather than by markdown-it's default so that
 * mermaid sources stay as plain text (rendered later) and normal code gets a
 * language label plus optional highlighting.
 */
function fenceRenderer(md: MarkdownIt, options: MarkdownOptions) {
  return (tokens: Token[], index: number): string => {
    const token = tokens[index];
    const info = token.info.trim();
    const language = info.split(/\s+/)[0].toLowerCase();
    const code = token.content;

    if (MERMAID_LANGUAGES.has(language)) {
      return mermaidHtml(code);
    }
    if (MATH_LANGUAGES.has(language)) {
      return mathBlockHtml(code);
    }

    let body = escapeHtml(code);
    let resolvedLanguage = language;
    if (options.settings.syntaxHighlight &&
        options.highlight) {
      const highlighted = options.highlight(code, language);
      if (highlighted !== null) {
        body = highlighted;
      } else {
        resolvedLanguage = '';
      }
    }

    const classes = ['usher-code'];
    if (resolvedLanguage) {
      classes.push(`language-${md.utils.escapeHtml(resolvedLanguage)}`);
    }
    if (options.settings.lineNumbers) {
      classes.push('usher-line-numbers');
    }
    const label = language ? ` data-language="${md.utils.escapeHtml(language)}"` : '';
    return `<pre class="${classes.join(' ')}"${label}><code>${body}</code></pre>`;
  };
}

export function createMarkdown(options: MarkdownOptions): MarkdownIt {
  const { settings } = options;
  const md = new MarkdownItFactory({
    html: true,
    xhtmlOut: false,
    breaks: false,
    linkify: settings.linkify,
    typographer: settings.typographer,
  });

  md.use(anchor as never, {
    slugify,
    level: [1, 2, 3, 4, 5, 6],
    tabIndex: false,
  });
  md.use(footnote as never);
  md.use(deflist as never);
  md.use(taskLists as never, { enabled: false, label: true, labelAfter: true });
  md.use(alertsPlugin);
  md.use(containerPlugin);
  if (settings.emoji) {
    md.use(emoji as never);
  }
  if (settings.math) {
    md.use(mathPlugin);
  }

  md.renderer.rules.fence = fenceRenderer(md, options);

  const defaultCodeInline = md.renderer.rules.code_inline;
  md.renderer.rules.code_inline = (tokens, index, opts, env, self) =>
    defaultCodeInline
      ? defaultCodeInline(tokens, index, opts, env, self)
      : `<code>${escapeHtml(tokens[index].content)}</code>`;

  md.renderer.rules.table_open = () => '<div class="usher-table-wrap"><table>';
  md.renderer.rules.table_close = () => '</table></div>';

  return md;
}

export function renderMarkdown(source: string, options: MarkdownOptions): string {
  return createMarkdown(options).render(source);
}
