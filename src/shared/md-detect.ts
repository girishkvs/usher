/**
 * Pure detection helpers. No DOM, no chrome APIs -- unit tested directly.
 */

export const MARKDOWN_EXTENSIONS = [
  'md',
  'markdown',
  'mdown',
  'mkd',
  'mkdn',
  'mdwn',
  'mdtxt',
  'mdtext',
  'mmd',
  'rmd',
  'qmd',
] as const;

export const PLAINTEXT_CONTENT_TYPES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/x-web-markdown',
  'application/markdown',
  'application/x-markdown',
  'application/octet-stream',
] as const;

const EXTENSION_SET = new Set<string>(MARKDOWN_EXTENSIONS);

/** Strips query/hash and returns the lowercased extension without the dot, or '' when absent. */
export function extensionOf(url: string): string {
  const withoutFragment = url.split('#')[0].split('?')[0];
  const lastSlash = withoutFragment.lastIndexOf('/');
  const name = lastSlash === -1 ? withoutFragment : withoutFragment.slice(lastSlash + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return name.slice(dot + 1).toLowerCase();
}

export function hasMarkdownExtension(url: string): boolean {
  return EXTENSION_SET.has(extensionOf(url));
}

/** Content types that Chrome renders inside a <pre>, which is where markdown source lands. */
export function isPlainTextContentType(contentType: string): boolean {
  const bare = contentType.split(';')[0].trim().toLowerCase();
  return (PLAINTEXT_CONTENT_TYPES as readonly string[]).includes(bare);
}

interface MarkdownSignal {
  pattern: RegExp;
  /** Strong structures score 2 so a single unambiguous one is enough. */
  weight: number;
}

const MARKDOWN_SIGNALS: MarkdownSignal[] = [
  { pattern: /^#{1,6}[ \t]\S/m, weight: 2 }, // ATX heading
  { pattern: /^```/m, weight: 2 }, // fenced code
  { pattern: /^~~~/m, weight: 2 }, // fenced code (tilde)
  { pattern: /^---[ \t]*\r?\n[\s\S]{0,4000}?^---[ \t]*$/m, weight: 2 }, // front matter
  { pattern: /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*\|/m, weight: 2 }, // table delimiter row
  { pattern: /^!\[[^\]\n]*\]\([^)\n]+\)/m, weight: 2 }, // image
  { pattern: /^\|.*\|[ \t]*$/m, weight: 1 }, // table row
  { pattern: /^[ \t]*[-*+][ \t]+\S/m, weight: 1 }, // bullet list
  { pattern: /^[ \t]*\d+\.[ \t]+\S/m, weight: 1 }, // ordered list
  { pattern: /^>[ \t]?\S/m, weight: 1 }, // blockquote
  { pattern: /\[[^\]\n]+\]\([^)\n]+\)/, weight: 1 }, // inline link
  { pattern: /\*\*[^*\n]+\*\*/, weight: 1 }, // bold
  { pattern: /^={3,}[ \t]*$/m, weight: 1 }, // setext heading underline
];

/**
 * Heuristic for "is this plain text actually markdown?". Used only when the URL
 * extension does not already say so (settings mode 'smart').
 */
export function looksLikeMarkdown(text: string, minimumScore = 2): boolean {
  const sample = text.length > 20000 ? text.slice(0, 20000) : text;
  if (sample.trim().length === 0) {
    return false;
  }
  let score = 0;
  for (const signal of MARKDOWN_SIGNALS) {
    if (signal.pattern.test(sample)) {
      score += signal.weight;
      if (score >= minimumScore) {
        return true;
      }
    }
  }
  return false;
}

/** Stable key used for the per-site allow/deny lists. file:// collapses to a single key. */
export function siteKeyFor(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') {
      return 'file://';
    }
    return parsed.origin;
  } catch {
    return url;
  }
}

export type AutoRenderMode = 'extension' | 'smart' | 'never';

/** Extensions that are plain text but are never markdown -- skip the content-type probe for these. */
const NON_MARKDOWN_EXTENSIONS = new Set([
  'txt',
  'log',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'xml',
  'yaml',
  'yml',
  'ini',
  'toml',
  'cfg',
  'conf',
  'sql',
  'js',
  'ts',
  'css',
  'py',
  'ps1',
  'sh',
  'diff',
  'patch',
]);

export interface DetectionInput {
  url: string;
  contentType: string;
  /** True when the document is Chrome's plain-text viewer: a body whose only element child is <pre>. */
  isPlainTextDocument: boolean;
  text: string;
  mode: AutoRenderMode;
  enabled: boolean;
  siteAllowList: string[];
  siteDenyList: string[];
  /**
   * True when the server declared a markdown content type. The declarativeNetRequest
   * rules rewrite that header to text/plain for the top-level document, so this is
   * recovered by probing the URL separately.
   */
  serverDeclaredMarkdown?: boolean;
}

export type DetectionReason =
  | 'disabled'
  | 'site-denied'
  | 'unsupported-scheme'
  | 'not-plain-text'
  | 'mode-never'
  | 'no-markdown-signal'
  | 'site-allowed'
  | 'markdown-extension'
  | 'markdown-content-type'
  | 'markdown-heuristic';

export interface DetectionResult {
  render: boolean;
  reason: DetectionReason;
}

const SUPPORTED_SCHEMES = new Set(['http:', 'https:', 'file:', 'ftp:']);

function schemeOf(url: string): string {
  try {
    return new URL(url).protocol;
  } catch {
    return '';
  }
}

/** Single decision point for auto-rendering, kept pure so it can be tested without a browser. */
export function shouldAutoRender(input: DetectionInput): DetectionResult {
  if (!input.enabled) {
    return { render: false, reason: 'disabled' };
  }

  const siteKey = siteKeyFor(input.url);
  if (input.siteDenyList.includes(siteKey)) {
    return { render: false, reason: 'site-denied' };
  }

  if (!SUPPORTED_SCHEMES.has(schemeOf(input.url))) {
    return { render: false, reason: 'unsupported-scheme' };
  }

  if (!input.isPlainTextDocument ||
      !isPlainTextContentType(input.contentType)) {
    return { render: false, reason: 'not-plain-text' };
  }

  // Manual mode means manual: it is checked before the automatic signals so the setting
  // matches its label. The allow list is a deliberate per-site opt-in and still applies.
  if (input.mode === 'never' &&
      !input.siteAllowList.includes(siteKey)) {
    return { render: false, reason: 'mode-never' };
  }

  if (hasMarkdownExtension(input.url)) {
    return { render: true, reason: 'markdown-extension' };
  }

  if (input.serverDeclaredMarkdown) {
    return { render: true, reason: 'markdown-content-type' };
  }

  if (input.siteAllowList.includes(siteKey)) {
    return { render: true, reason: 'site-allowed' };
  }

  if (input.mode === 'extension') {
    return { render: false, reason: 'no-markdown-signal' };
  }

  return looksLikeMarkdown(input.text)
    ? { render: true, reason: 'markdown-heuristic' }
    : { render: false, reason: 'no-markdown-signal' };
}

/**
 * A page served as `text/markdown` reaches the content script as `text/plain`
 * because the network rules rewrite it. Probing the URL again recovers the
 * original header, but it costs a request, so only do it where it can change
 * the outcome.
 */
export function needsContentTypeProbe(input: DetectionInput): boolean {
  if (!input.enabled ||
      input.serverDeclaredMarkdown) {
    return false;
  }
  if (!input.isPlainTextDocument ||
      !isPlainTextContentType(input.contentType)) {
    return false;
  }
  const scheme = schemeOf(input.url);
  if (scheme !== 'http:' &&
      scheme !== 'https:') {
    return false;
  }
  const siteKey = siteKeyFor(input.url);
  if (input.siteDenyList.includes(siteKey) ||
      input.siteAllowList.includes(siteKey)) {
    return false;
  }
  if (hasMarkdownExtension(input.url) ||
      NON_MARKDOWN_EXTENSIONS.has(extensionOf(input.url))) {
    return false;
  }
  return input.mode !== 'never';
}

/** True when a Content-Type header names one of the markdown media types. */
export function isMarkdownContentType(contentType: string): boolean {
  const bare = contentType.split(';')[0].trim().toLowerCase();
  return bare === 'text/markdown' || bare === 'text/x-markdown' || bare === 'text/x-web-markdown' || bare === 'application/markdown' || bare === 'application/x-markdown';
}
