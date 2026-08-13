import { createMarkdown } from './markdown.js';
import { highlightCode } from './highlight.js';
import { sanitizeMarkdownHtml } from './sanitize.js';
import { renderMermaid } from './mermaid-host.js';
import { renderMath } from './math-host.js';
import type { VendorLoader } from './vendor-loader.js';
import { formatFrontMatterValue, splitFrontMatter } from '../shared/frontmatter.js';
import type { Settings, ThemeName } from '../shared/settings.js';
import type { StatusResponse } from '../shared/messages.js';

export interface ViewContext {
  /** Element the view fully owns and replaces on every render. */
  host: HTMLElement;
  settings: Settings;
  sourceUrl: string;
  assetUrl: (path: string) => string;
  loadVendor: VendorLoader;
  /** Called with the derived document title so the caller can set document.title. */
  onTitle?: (title: string) => void;
  /** Shown in the header; defaults to the file name from sourceUrl. */
  subtitle?: string;
}

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Segoe UI Variable Text", Roboto, "Helvetica Neue", Arial, sans-serif';

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function isDarkTheme(theme: ThemeName): boolean {
  if (theme === 'dark' ||
      theme === 'high-contrast') {
    return true;
  }
  if (theme === 'light' ||
      theme === 'github' ||
      theme === 'sepia') {
    return false;
  }
  return prefersDark();
}

function fileNameFrom(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return decodeURIComponent(segments[segments.length - 1] ?? parsed.hostname);
  } catch {
    return url;
  }
}

function svgIcon(path: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

const ICONS = {
  toc: 'M4 5h16v2H4V5Zm0 6h16v2H4v-2Zm0 6h10v2H4v-2Z',
  raw: 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4Z',
  print: 'M7 3h10v4H7V3ZM5 8h14a2 2 0 0 1 2 2v6h-4v5H7v-5H3v-6a2 2 0 0 1 2-2Zm4 8h6v3H9v-3Z',
  copy: 'M8 3h9a2 2 0 0 1 2 2v11h-2V5H8V3Zm-3 4h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h9V9H5Z',
  theme: 'M12 3a9 9 0 1 0 9 9c0-.5-.04-1-.11-1.48A5 5 0 0 1 12 3Z',
  top: 'M12 5 5 12l1.4 1.4L11 8.8V20h2V8.8l4.6 4.6L19 12l-7-7Z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 4a7.4 7.4 0 0 0-.14-1.4l2.02-1.56-2-3.46-2.4.96a7.6 7.6 0 0 0-2.42-1.4L16.1 2h-4l-.36 2.54a7.6 7.6 0 0 0-2.42 1.4l-2.4-.96-2 3.46L2.94 10a7.5 7.5 0 0 0 0 2.8L.92 14.36l2 3.46 2.4-.96a7.6 7.6 0 0 0 2.42 1.4L8.1 22h4l.36-2.54a7.6 7.6 0 0 0 2.42-1.4l2.4.96 2-3.46-2.02-1.56c.09-.46.14-.93.14-1.4Z',
};

interface HeadingEntry {
  id: string;
  level: number;
  text: string;
  element: HTMLElement;
  link: HTMLAnchorElement;
}

export class UsherView {
  private readonly context: ViewContext;

  private settings: Settings;

  private source = '';

  private headings: HeadingEntry[] = [];

  private rawVisible = false;

  private tocVisible: boolean;

  private mermaidCount = 0;

  private title = '';

  private observer: IntersectionObserver | null = null;

  private disposeDiagrams: (() => void) | null = null;

  private readonly colorScheme: MediaQueryList | null =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  private elements: {
    app: HTMLElement;
    sidebar: HTMLElement;
    toc: HTMLElement;
    article: HTMLElement;
    raw: HTMLElement;
    header: HTMLElement;
    meta: HTMLElement;
    progress: HTMLElement;
    heading: HTMLElement;
  } | null = null;

  private readonly onScroll = (): void => this.updateProgress();

  private readonly onColorSchemeChange = (): void => {
    if (this.settings.theme === 'auto') {
      void this.render();
    }
  };

  constructor(context: ViewContext) {
    this.context = context;
    this.settings = context.settings;
    this.tocVisible = context.settings.showToc && !context.settings.tocCollapsed;
  }

  get documentTitle(): string {
    return this.title;
  }

  setSource(markdown: string): void {
    this.source = markdown;
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.tocVisible = settings.showToc && !settings.tocCollapsed;
  }

  status(): StatusResponse {
    return {
      rendered: this.elements !== null,
      raw: this.rawVisible,
      tocVisible: this.tocVisible,
      headings: this.headings.length,
      mermaidDiagrams: this.mermaidCount,
      words: this.source.trim() ? this.source.trim().split(/\s+/).length : 0,
      title: this.title,
    };
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.disposeDiagrams?.();
    this.disposeDiagrams = null;
    window.removeEventListener('scroll', this.onScroll);
    this.colorScheme?.removeEventListener('change', this.onColorSchemeChange);
  }

  async render(): Promise<void> {
    // A previous render may have left a diagram in full screen, holding the document's
    // overflow and an Escape listener that would outlive the element.
    this.disposeDiagrams?.();
    this.disposeDiagrams = null;

    const { data, body } = splitFrontMatter(this.source);
    const markdown = createMarkdown({ settings: this.settings, highlight: highlightCode });
    const html = sanitizeMarkdownHtml(markdown.render(body));

    const shell = this.buildShell();
    shell.article.innerHTML = html;
    shell.raw.textContent = this.source;

    if (data &&
        this.settings.showFrontMatter) {
      shell.article.prepend(this.buildFrontMatter(data));
    }

    this.title = this.deriveTitle(shell.article, data);
    shell.heading.textContent = this.title;
    this.context.onTitle?.(this.title);

    this.decorateCodeBlocks(shell.article);
    this.decorateHeadings(shell.article);
    this.decorateTables(shell.article);
    this.buildToc(shell.toc);
    this.updateMeta(shell.meta, body);
    this.applyTheme();
    this.attachScrollSpy();

    window.removeEventListener('scroll', this.onScroll);
    window.addEventListener('scroll', this.onScroll, { passive: true });
    if (this.colorScheme) {
      this.colorScheme.removeEventListener('change', this.onColorSchemeChange);
      this.colorScheme.addEventListener('change', this.onColorSchemeChange);
    }

    const dark = isDarkTheme(this.settings.theme);
    if (this.settings.mermaid) {
      const diagrams = await renderMermaid(shell.article, {
        theme: this.settings.mermaidTheme,
        dark,
        loadVendor: this.context.loadVendor,
        fontFamily: FONT_STACK,
      });
      this.mermaidCount = diagrams.count;
      this.disposeDiagrams = diagrams.dispose;
    }
    if (this.settings.math) {
      await renderMath(shell.article, this.context.loadVendor);
    }

    this.updateProgress();
  }

  setRaw(raw: boolean): void {
    this.rawVisible = raw;
    if (!this.elements) {
      return;
    }
    this.elements.article.hidden = raw;
    this.elements.raw.hidden = !raw;
    this.elements.app.dataset.usherRaw = raw ? '1' : '0';
  }

  toggleRaw(): void {
    this.setRaw(!this.rawVisible);
  }

  toggleToc(): void {
    this.tocVisible = !this.tocVisible;
    if (this.elements) {
      this.elements.app.dataset.usherToc = this.tocVisible ? '1' : '0';
    }
  }

  async copyHtml(): Promise<void> {
    if (!this.elements) {
      return;
    }
    const html = this.elements.article.innerHTML;
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([this.elements.article.innerText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      this.flash('Rich HTML copied');
    } catch {
      await navigator.clipboard.writeText(html);
      this.flash('HTML copied');
    }
  }

  print(): void {
    window.print();
  }

  private flash(message: string): void {
    if (!this.elements) {
      return;
    }
    const toast = document.createElement('div');
    toast.className = 'usher-toast';
    toast.textContent = message;
    this.elements.app.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
  }

  private buildShell(): NonNullable<UsherView['elements']> {
    this.context.host.textContent = '';

    const app = document.createElement('div');
    app.className = 'usher-app';
    app.dataset.usherToc = this.tocVisible ? '1' : '0';
    app.dataset.usherRaw = '0';
    app.dataset.usherWidth = this.settings.contentWidth;

    const progress = document.createElement('div');
    progress.className = 'usher-progress';
    progress.innerHTML = '<span></span>';

    const sidebar = document.createElement('aside');
    sidebar.className = 'usher-sidebar';
    const sidebarHead = document.createElement('div');
    sidebarHead.className = 'usher-sidebar-head';
    sidebarHead.textContent = 'Contents';
    const toc = document.createElement('nav');
    toc.className = 'usher-toc';
    toc.setAttribute('aria-label', 'Table of contents');
    sidebar.append(sidebarHead, toc);

    const main = document.createElement('div');
    main.className = 'usher-main';

    const header = document.createElement('header');
    header.className = 'usher-header';
    const titles = document.createElement('div');
    titles.className = 'usher-titles';
    const heading = document.createElement('h1');
    heading.className = 'usher-doc-title';
    const meta = document.createElement('div');
    meta.className = 'usher-meta';
    titles.append(heading, meta);

    const actions = document.createElement('div');
    actions.className = 'usher-actions';
    actions.append(
      this.headerButton('Toggle contents  (t)', ICONS.toc, () => this.toggleToc()),
      this.headerButton('Toggle source  (r)', ICONS.raw, () => this.toggleRaw()),
      this.headerButton('Copy as rich HTML', ICONS.copy, () => void this.copyHtml()),
      this.headerButton('Print / save as PDF', ICONS.print, () => this.print()),
      this.headerButton('Cycle theme', ICONS.theme, () => this.cycleTheme()),
      this.headerButton('Back to top', ICONS.top, () => window.scrollTo({ top: 0, behavior: 'smooth' })),
    );
    header.append(titles, actions);

    const article = document.createElement('article');
    article.className = 'usher-markdown';

    const raw = document.createElement('pre');
    raw.className = 'usher-raw';
    raw.hidden = true;

    main.append(header, article, raw);
    app.append(progress, sidebar, main);
    this.context.host.appendChild(app);

    this.elements = { app, sidebar, toc, article, raw, header, meta, progress, heading };
    return this.elements;
  }

  private headerButton(label: string, path: string, onClick: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'usher-action';
    element.title = label;
    element.setAttribute('aria-label', label);
    element.innerHTML = svgIcon(path);
    element.addEventListener('click', onClick);
    return element;
  }

  private cycleTheme(): void {
    const order: ThemeName[] = ['auto', 'light', 'dark', 'github', 'sepia', 'high-contrast'];
    const next = order[(order.indexOf(this.settings.theme) + 1) % order.length];
    this.settings = { ...this.settings, theme: next };
    this.applyTheme();
    this.flash(`Theme: ${next}`);
    void chrome.storage?.sync?.get('usher.settings').then((stored) => {
      const current = (stored['usher.settings'] ?? {}) as Record<string, unknown>;
      return chrome.storage.sync.set({ 'usher.settings': { ...current, theme: next } });
    });
  }

  private applyTheme(): void {
    if (!this.elements) {
      return;
    }
    const dark = isDarkTheme(this.settings.theme);
    const root = document.documentElement;
    root.dataset.usherTheme = this.settings.theme;
    root.dataset.usherDark = dark ? '1' : '0';
    root.style.setProperty('--usher-font-size', `${this.settings.fontSize}px`);
    this.elements.app.dataset.usherWidth = this.settings.contentWidth;

    const customId = 'usher-custom-css';
    document.getElementById(customId)?.remove();
    if (this.settings.customCss.trim()) {
      const style = document.createElement('style');
      style.id = customId;
      style.textContent = this.settings.customCss;
      document.head.appendChild(style);
    }
  }

  private buildFrontMatter(data: Record<string, unknown>): HTMLElement {
    const details = document.createElement('details');
    details.className = 'usher-frontmatter';
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = 'Front matter';
    const table = document.createElement('table');
    for (const [key, value] of Object.entries(data)) {
      const row = document.createElement('tr');
      const name = document.createElement('th');
      name.textContent = key;
      const cell = document.createElement('td');
      cell.textContent = formatFrontMatterValue(value);
      row.append(name, cell);
      table.appendChild(row);
    }
    details.append(summary, table);
    return details;
  }

  private deriveTitle(article: HTMLElement, data: Record<string, unknown> | null): string {
    const fromFrontMatter = data && typeof data.title === 'string' ? data.title.trim() : '';
    if (fromFrontMatter) {
      return fromFrontMatter;
    }
    const firstHeading = article.querySelector('h1, h2');
    const text = firstHeading?.textContent?.trim();
    if (text) {
      return text;
    }
    return this.context.subtitle ?? fileNameFrom(this.context.sourceUrl);
  }

  private decorateCodeBlocks(article: HTMLElement): void {
    if (!this.settings.copyButtons) {
      return;
    }
    for (const pre of Array.from(article.querySelectorAll<HTMLElement>('pre.usher-code'))) {
      const wrapper = document.createElement('div');
      wrapper.className = 'usher-code-wrap';
      const language = pre.dataset.language;
      if (language) {
        const badge = document.createElement('span');
        badge.className = 'usher-code-language';
        badge.textContent = language;
        wrapper.appendChild(badge);
      }
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'usher-copy';
      copy.textContent = 'Copy';
      copy.addEventListener('click', () => {
        void navigator.clipboard.writeText(pre.textContent ?? '');
        copy.textContent = 'Copied';
        copy.classList.add('is-done');
        setTimeout(() => {
          copy.textContent = 'Copy';
          copy.classList.remove('is-done');
        }, 1400);
      });
      pre.replaceWith(wrapper);
      wrapper.append(copy, pre);
    }
  }

  private decorateHeadings(article: HTMLElement): void {
    this.headings = [];
    if (!this.settings.headingAnchors) {
      return;
    }
    for (const heading of Array.from(article.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'))) {
      const anchor = document.createElement('a');
      anchor.className = 'usher-anchor';
      anchor.href = `#${heading.id}`;
      anchor.setAttribute('aria-label', `Link to ${heading.textContent ?? heading.id}`);
      anchor.textContent = '#';
      heading.appendChild(anchor);
    }
  }

  private decorateTables(article: HTMLElement): void {
    for (const table of Array.from(article.querySelectorAll('table'))) {
      if (!table.closest('.usher-table-wrap') &&
          !table.closest('.usher-frontmatter')) {
        const wrap = document.createElement('div');
        wrap.className = 'usher-table-wrap';
        table.replaceWith(wrap);
        wrap.appendChild(table);
      }
    }
  }

  private buildToc(container: HTMLElement): void {
    container.textContent = '';
    this.headings = [];
    if (!this.elements) {
      return;
    }
    const found = Array.from(
      this.elements.article.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'),
    );
    if (found.length < 2) {
      this.elements.app.dataset.usherToc = '0';
      this.tocVisible = false;
      return;
    }

    const minLevel = Math.min(...found.map((heading) => Number(heading.tagName.slice(1))));
    const list = document.createElement('ul');
    for (const heading of found) {
      const level = Number(heading.tagName.slice(1));
      const item = document.createElement('li');
      item.dataset.level = String(Math.min(level - minLevel, 3));
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.textContent = (heading.textContent ?? '').replace(/#$/, '').trim();
      link.addEventListener('click', (event) => {
        event.preventDefault();
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', `#${heading.id}`);
      });
      item.appendChild(link);
      list.appendChild(item);
      this.headings.push({ id: heading.id, level, text: link.textContent, element: heading, link });
    }
    container.appendChild(list);
  }

  private updateMeta(meta: HTMLElement, body: string): void {
    const words = body.trim() ? body.trim().split(/\s+/).length : 0;
    const minutes = Math.max(1, Math.round(words / 220));
    const parts = [
      fileNameFrom(this.context.sourceUrl),
      `${words.toLocaleString()} words`,
      `${minutes} min read`,
    ];
    meta.textContent = parts.join('  ·  ');
    meta.title = this.context.sourceUrl;
  }

  private attachScrollSpy(): void {
    this.observer?.disconnect();
    if (this.headings.length === 0) {
      return;
    }
    const visible = new Set<string>();
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) {
            visible.add(id);
          } else {
            visible.delete(id);
          }
        }
        const active = this.headings.find((heading) => visible.has(heading.id)) ?? this.lastPassedHeading();
        for (const heading of this.headings) {
          heading.link.classList.toggle('is-active', heading === active);
        }
        active?.link.scrollIntoView({ block: 'nearest' });
      },
      { rootMargin: '-64px 0px -70% 0px', threshold: 0 },
    );
    for (const heading of this.headings) {
      this.observer.observe(heading.element);
    }
  }

  private lastPassedHeading(): HeadingEntry | undefined {
    let candidate: HeadingEntry | undefined;
    for (const heading of this.headings) {
      if (heading.element.getBoundingClientRect().top <= 80) {
        candidate = heading;
      }
    }
    return candidate;
  }

  private updateProgress(): void {
    if (!this.elements) {
      return;
    }
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    const bar = this.elements.progress.firstElementChild as HTMLElement | null;
    if (bar) {
      bar.style.width = `${(ratio * 100).toFixed(2)}%`;
    }
  }
}
