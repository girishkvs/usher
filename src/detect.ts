import { loadSettings } from './shared/settings.js';
import {
  isMarkdownContentType,
  isPlainTextContentType,
  needsContentTypeProbe,
  shouldAutoRender,
  type DetectionInput,
} from './shared/md-detect.js';
import type { RenderRequest } from './shared/messages.js';

/**
 * Lightweight detector that runs on every top-level document. It must stay cheap:
 * the heavy renderer is injected by the service worker only once this decides the
 * page really is markdown.
 */

const RENDERED_FLAG = 'usherRendered';
const PROBE_TIMEOUT_MS = 2500;

function plainTextBody(): HTMLPreElement | null {
  const body = document.body;
  if (!body) {
    return null;
  }
  const children = Array.from(body.children).filter(
    (child) => child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE' && child.tagName !== 'LINK',
  );
  if (children.length !== 1) {
    return null;
  }
  const [only] = children;
  return only.tagName === 'PRE' ? (only as HTMLPreElement) : null;
}

/**
 * The network rules rewrite `text/markdown` to `text/plain` for the top-level
 * document only, so re-requesting the URL still reports the original header.
 */
async function probeContentType(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'force-cache',
      credentials: 'same-origin',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) {
      return '';
    }
    return response.headers.get('content-type') ?? '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function detect(): Promise<void> {
  if (window.top !== window.self) {
    return;
  }
  if (document.documentElement.dataset[RENDERED_FLAG] === '1') {
    return;
  }

  // Bail before touching extension storage: this runs on every page, and the overwhelming
  // majority are rendered HTML that can be rejected from the DOM shape alone.
  const pre = plainTextBody();
  if (!pre ||
      !isPlainTextContentType(document.contentType)) {
    return;
  }

  const settings = await loadSettings();
  const text = pre.textContent ?? '';

  const input: DetectionInput = {
    url: location.href,
    contentType: document.contentType,
    isPlainTextDocument: true,
    text,
    mode: settings.mode,
    enabled: settings.enabled,
    siteAllowList: settings.siteAllowList,
    siteDenyList: settings.siteDenyList,
  };

  let decision = shouldAutoRender(input);
  if (!decision.render &&
      needsContentTypeProbe(input)) {
    const probed = await probeContentType(input.url);
    if (isMarkdownContentType(probed)) {
      decision = shouldAutoRender({ ...input, serverDeclaredMarkdown: true });
    }
  }

  if (!decision.render) {
    return;
  }

  document.documentElement.dataset[RENDERED_FLAG] = 'pending';
  const message: RenderRequest = { type: 'usher:render-request', reason: decision.reason };
  try {
    const response = (await chrome.runtime.sendMessage(message)) as { ok?: boolean } | undefined;
    if (!response?.ok) {
      delete document.documentElement.dataset[RENDERED_FLAG];
    }
  } catch {
    delete document.documentElement.dataset[RENDERED_FLAG];
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void detect(), { once: true });
} else {
  void detect();
}
