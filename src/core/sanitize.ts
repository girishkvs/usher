import createDOMPurify from 'dompurify';

const purify = createDOMPurify(window);

/**
 * DOMPurify applies ALLOWED_URI_REGEXP to every attribute it is unsure about, not just
 * URI-bearing ones, so a narrow scheme-only pattern silently strips `href="guide.md"`,
 * `src="images/x.png"`, `colspan="2"`, and `type="checkbox"`. This is DOMPurify's default
 * expression -- which accepts relative values and ordinary attribute text -- widened with
 * the two extra schemes Usher needs. Scheme policy is enforced in the hook below, where
 * only genuine URI attributes are inspected.
 */
const ALLOWED_URI =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|file|chrome-extension):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const URI_ATTRIBUTES = ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background'];
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'ftp', 'file', 'chrome-extension']);
const ALLOWED_DATA_IMAGES = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon);/i;
const SCHEME_PATTERN = /^([a-z][a-z0-9+.\-]*):/i;
const TASK_CHECKBOX_CLASS = 'task-list-item-checkbox';
const URI_WHITESPACE = /[\u0000-\u0020\u00a0\u1680\u180e\u2000-\u2029\u205f\u3000]/g;

/** True when a URI attribute value is safe to keep. Relative values have no scheme and are fine. */
function isSafeUri(value: string, tagName: string): boolean {
  const trimmed = value.replace(URI_WHITESPACE, '');
  const match = SCHEME_PATTERN.exec(trimmed);
  if (!match) {
    return true;
  }
  const scheme = match[1].toLowerCase();
  if (scheme === 'data') {
    // SVG data URIs are excluded: they can carry markup that some contexts will run.
    return (tagName === 'IMG' || tagName === 'IMAGE') && ALLOWED_DATA_IMAGES.test(trimmed);
  }
  return ALLOWED_SCHEMES.has(scheme);
}

purify.addHook('afterSanitizeAttributes', (node) => {
  if (!(node instanceof Element)) {
    return;
  }

  for (const attribute of URI_ATTRIBUTES) {
    const value = node.getAttribute(attribute);
    if (value !== null &&
        !isSafeUri(value, node.tagName)) {
      node.removeAttribute(attribute);
    }
  }

  // Markdown may contain arbitrary HTML, so a document could otherwise render a form that
  // looks like it belongs to the browser. Task-list checkboxes are the only input we keep.
  if (node.tagName === 'INPUT') {
    if (!node.classList.contains(TASK_CHECKBOX_CLASS)) {
      node.remove();
      return;
    }
    node.setAttribute('type', 'checkbox');
    node.setAttribute('disabled', '');
    node.removeAttribute('name');
    node.removeAttribute('value');
  }

  if (node.tagName === 'A') {
    const href = node.getAttribute('href') ?? '';
    if (href &&
        !href.startsWith('#')) {
      node.setAttribute('rel', 'noopener noreferrer');
      if (SCHEME_PATTERN.test(href)) {
        node.setAttribute('target', '_blank');
      }
    }
  }

  if (node.tagName === 'IMG') {
    node.setAttribute('loading', 'lazy');
    node.setAttribute('decoding', 'async');
  }
});

const MARKDOWN_CONFIG = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  ADD_ATTR: ['target', 'align', 'colspan', 'rowspan', 'start', 'reversed', 'checked', 'disabled', 'type'],
  FORBID_TAGS: [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'base',
    'link',
    'meta',
    'button',
    'select',
    'textarea',
    'option',
    'dialog',
  ],
  FORBID_ATTR: ['srcdoc', 'formaction', 'ping', 'autofocus'],
  ALLOW_DATA_ATTR: true,
  ALLOWED_URI_REGEXP: ALLOWED_URI,
} as const;

export function sanitizeMarkdownHtml(html: string): string {
  return purify.sanitize(html, {
    ...MARKDOWN_CONFIG,
    ADD_ATTR: [...MARKDOWN_CONFIG.ADD_ATTR],
    FORBID_ATTR: [...MARKDOWN_CONFIG.FORBID_ATTR],
    FORBID_TAGS: [...MARKDOWN_CONFIG.FORBID_TAGS],
  });
}

const SVG_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true, mathMl: true },
  ADD_ATTR: [
    'xmlns',
    'xmlns:xlink',
    'viewBox',
    'preserveAspectRatio',
    'dominant-baseline',
    'text-anchor',
    'marker-end',
    'marker-start',
  ],
  FORBID_TAGS: ['script', 'foreignObject'],
  ALLOW_DATA_ATTR: true,
  ALLOWED_URI_REGEXP: ALLOWED_URI,
} as const;

/** Mermaid output is SVG generated from the document's own text, but it is still sanitised. */
export function sanitizeSvg(svg: string): string {
  return purify.sanitize(svg, {
    ...SVG_CONFIG,
    ADD_ATTR: [...SVG_CONFIG.ADD_ATTR],
    FORBID_TAGS: [...SVG_CONFIG.FORBID_TAGS],
  });
}
