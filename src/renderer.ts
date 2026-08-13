import { UsherView } from './core/render-shell.js';
import type { VendorLoader, VendorName } from './core/vendor-loader.js';
import { loadSettings, onSettingsChanged, type Settings } from './shared/settings.js';
import type { RendererCommand, StatusRequest, StatusResponse } from './shared/messages.js';

/**
 * Injected on demand into a markdown document. Replaces the plain-text body with
 * the rendered view and keeps the original source available for the raw toggle.
 */

interface RendererState {
  view: UsherView;
  originalBody: string;
  originalTitle: string;
  source: string;
  settings: Settings;
  active: boolean;
  timer: number | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __usherState: RendererState | undefined;
  // eslint-disable-next-line no-var
  var __usherBooting: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __usherForce: string | undefined;
}

const STYLE_ID = 'usher-stylesheet';
const SCROLL_KEY = `usher.scroll:${location.href}`;

function assetUrl(path: string): string {
  return chrome.runtime.getURL(path);
}

const loadVendor: VendorLoader = async (vendor: VendorName) => {
  const response = (await chrome.runtime.sendMessage({ type: 'usher:load-vendor', vendor })) as
    | { ok: boolean; error?: string }
    | undefined;
  if (!response?.ok) {
    throw new Error(response?.error ?? `Could not load ${vendor}`);
  }
};

/** The plain-text viewer shape: a body whose only element child is a <pre>. */
function plainTextPre(): HTMLPreElement | null {
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

function readSource(force: string | undefined): string {
  if (force === 'selection') {
    const selection = window.getSelection()?.toString() ?? '';
    if (selection.trim()) {
      return selection;
    }
  }
  // Only trust a <pre> when it is the whole document. A rendered HTML page may contain
  // any number of them, and using the first would render a fragment of the page.
  const pre = plainTextPre();
  if (pre) {
    const text = pre.textContent ?? '';
    if (text.trim()) {
      return text;
    }
  }
  return document.body?.innerText ?? '';
}

function ensureStylesheet(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = assetUrl('styles/usher.css');
  document.head.appendChild(link);

  const katexCss = document.createElement('link');
  katexCss.id = 'usher-katex-css';
  katexCss.rel = 'stylesheet';
  katexCss.href = assetUrl('vendor/katex/katex.min.css');
  document.head.appendChild(katexCss);

  if (!document.querySelector('meta[name="viewport"]')) {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(meta);
  }
}

function saveScroll(): void {
  try {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  } catch {
    // sessionStorage is unavailable on some schemes; scroll restore is optional.
  }
}

function restoreScroll(): void {
  try {
    const stored = Number(sessionStorage.getItem(SCROLL_KEY));
    if (Number.isFinite(stored) &&
        stored > 0) {
      window.scrollTo({ top: stored });
    }
  } catch {
    // Ignore.
  }
}

function installKeyboardShortcuts(state: RendererState): void {
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (event.ctrlKey ||
        event.metaKey ||
        event.altKey) {
      return;
    }
    if (target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
      return;
    }
    if (event.key === 't') {
      state.view.toggleToc();
    } else if (event.key === 'r') {
      state.view.toggleRaw();
    } else if (event.key === 'p' &&
               event.shiftKey) {
      state.view.print();
    }
  });
}

async function fetchSource(): Promise<string | null> {
  try {
    const response = await fetch(location.href, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

function startAutoReload(state: RendererState, settings: Settings): void {
  if (state.timer !== null) {
    clearInterval(state.timer);
    state.timer = null;
  }
  const isLocal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (!settings.autoReload ||
      !isLocal) {
    return;
  }
  state.timer = window.setInterval(() => {
    if (document.visibilityState !== 'visible' ||
        !state.active) {
      return;
    }
    void fetchSource().then((text) => {
      if (text === null ||
          text === state.source) {
        return;
      }
      state.source = text;
      const scrollY = window.scrollY;
      state.view.setSource(text);
      void state.view.render().then(() => window.scrollTo({ top: scrollY }));
    });
  }, Math.max(500, settings.autoReloadIntervalMs));
}

function restoreOriginal(state: RendererState): void {
  document.body.innerHTML = state.originalBody;
  document.title = state.originalTitle;
  document.documentElement.dataset.usherRendered = '0';
  document.getElementById(STYLE_ID)?.remove();
  state.active = false;
}

async function activate(state: RendererState, settings: Settings): Promise<void> {
  ensureStylesheet();
  document.body.textContent = '';
  document.body.className = 'usher-body';
  document.documentElement.dataset.usherRendered = '1';
  state.settings = settings;
  state.view.setSettings(settings);
  state.view.setSource(state.source);
  await state.view.render();
  state.active = true;
  if (settings.scrollPosition) {
    restoreScroll();
  }
}

async function boot(): Promise<void> {
  if (globalThis.__usherState) {
    const existing = globalThis.__usherState;
    if (!existing.active) {
      await activate(existing, await loadSettings());
    }
    return;
  }

  const force = globalThis.__usherForce;
  delete globalThis.__usherForce;

  const settings = await loadSettings();
  const source = readSource(force);
  const originalBody = document.body?.innerHTML ?? '';
  const originalTitle = document.title;

  // Re-check: a concurrent injection may have finished while settings were loading.
  if (globalThis.__usherState) {
    return;
  }

  const view = new UsherView({
    host: document.body,
    settings,
    sourceUrl: location.href,
    assetUrl,
    loadVendor,
    onTitle: (title) => {
      document.title = title ? `${title} — Usher` : document.title;
    },
  });

  const state: RendererState = {
    view,
    originalBody,
    originalTitle,
    source,
    settings,
    active: false,
    timer: null,
  };
  globalThis.__usherState = state;

  await activate(state, settings);
  installKeyboardShortcuts(state);
  startAutoReload(state, settings);
  window.addEventListener('beforeunload', saveScroll);
  window.addEventListener('scroll', saveScroll, { passive: true });

  onSettingsChanged((next) => {
    state.settings = next;
    view.setSettings(next);
    if (state.active) {
      const scrollY = window.scrollY;
      void view.render().then(() => window.scrollTo({ top: scrollY }));
    }
    startAutoReload(state, next);
  });

  chrome.runtime.onMessage.addListener((message: RendererCommand | StatusRequest, _sender, sendResponse) => {
    if (message.type === 'usher:status-request') {
      const status: StatusResponse = view.status();
      sendResponse({ ...status, rendered: state.active });
      return false;
    }
    if (message.type !== 'usher:command') {
      return false;
    }
    switch (message.command) {
      case 'toggle-raw':
        view.toggleRaw();
        break;
      case 'toggle-toc':
        view.toggleToc();
        break;
      case 'print':
        view.print();
        break;
      case 'copy-html':
        void view.copyHtml();
        break;
      case 'reload':
        void fetchSource().then((text) => {
          if (text !== null) {
            state.source = text;
            view.setSource(text);
            void view.render();
          }
        });
        break;
      case 'toggle-render':
        if (state.active) {
          restoreOriginal(state);
        } else {
          void activate(state, state.settings);
        }
        break;
      default:
        break;
    }
    sendResponse({ ok: true });
    return false;
  });
}

// A synchronous sentinel: two injections racing would otherwise both get past the
// `__usherState` check while the first is still awaiting settings, and each would
// install its own message listener and reload timer.
if (!globalThis.__usherBooting) {
  globalThis.__usherBooting = boot().catch((error: unknown) => {
    delete globalThis.__usherBooting;
    throw error;
  });
} else {
  void globalThis.__usherBooting.then(() => boot());
}
