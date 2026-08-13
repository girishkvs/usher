import { sanitizeSvg } from './sanitize.js';
import { ensureVendor, vendorGlobal, type VendorLoader } from './vendor-loader.js';
import type { MermaidTheme } from '../shared/settings.js';
import { MERMAID_CLASS } from './markdown.js';

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string, container?: Element): Promise<{ svg: string }>;
}

export interface MermaidRenderOptions {
  theme: MermaidTheme;
  dark: boolean;
  loadVendor: VendorLoader;
  fontFamily: string;
}

let initializedTheme: string | null = null;
let sequence = 0;

function resolveTheme(theme: MermaidTheme, dark: boolean): string {
  if (theme !== 'auto') {
    return theme;
  }
  return dark ? 'dark' : 'default';
}

function icon(name: string): string {
  const paths: Record<string, string> = {
    'zoom-in': 'M11 4a7 7 0 1 0 4.24 12.56l4.1 4.1 1.42-1.42-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-1 2v2H8v2h2v2h2v-2h2v-2h-2V8h-2Z',
    'zoom-out': 'M11 4a7 7 0 1 0 4.24 12.56l4.1 4.1 1.42-1.42-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10ZM8 10v2h6v-2H8Z',
    reset: 'M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z',
    download: 'M12 3v10l3.5-3.5 1.4 1.4L12 16.8 7.1 10.9l1.4-1.4L12 13V3ZM5 18h14v2H5v-2Z',
    image: 'M4 4h16v16H4V4Zm2 2v8.6l3.3-3.3 3.4 3.4 2.3-2.3L18 15V6H6Zm2.5 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z',
    copy: 'M8 3h9a2 2 0 0 1 2 2v11h-2V5H8V3Zm-3 4h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h9V9H5Z',
    expand: 'M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z',
    collapse: 'M8 4h2v6H4V8h4V4Zm6 0h2v4h4v2h-6V4ZM4 14h6v6H8v-4H4v-2Zm10 0h6v2h-4v4h-2v-6Z',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] ?? ''}"/></svg>`;
}

function button(label: string, iconName: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'usher-diagram-button';
  element.title = label;
  element.setAttribute('aria-label', label);
  element.innerHTML = icon(iconName);
  element.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return element;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function svgToPngBlob(svg: SVGSVGElement, natural: { width: number; height: number }, scale = 2): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const width = Math.max(1, Math.round(natural.width));
  const height = Math.max(1, Math.round(natural.height));
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.style.removeProperty('transform');
  clone.style.removeProperty('max-width');

  const serialized = new XMLSerializer().serializeToString(clone);
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not rasterise the diagram'));
    image.src = source;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable');
  }
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--usher-bg') || '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png');
  });
}

/**
 * Wide diagrams are the common case, and letting the browser shrink one to the
 * column width makes it unreadable. The diagram is drawn at its natural size
 * inside a canvas box sized to `natural x scale`, so the stage gets real
 * scrollbars, the result stays centred, and zooming does not disturb layout.
 */
const MINIMUM_FIT_SCALE = 0.55;
const MAXIMUM_STAGE_HEIGHT = 0.75;

function attachViewport(figure: HTMLElement, svg: SVGSVGElement, source: string, index: number): () => void {
  const stage = figure.querySelector<HTMLElement>('.usher-diagram-stage');
  const canvas = figure.querySelector<HTMLElement>('.usher-diagram-canvas');
  if (!stage ||
      !canvas) {
    return () => {};
  }

  // Read the size from the viewBox rather than the layout box: the element has
  // already been sized by its container by the time this runs.
  const natural = {
    width: svg.viewBox.baseVal.width || svg.getBoundingClientRect().width || 800,
    height: svg.viewBox.baseVal.height || svg.getBoundingClientRect().height || 600,
  };

  svg.style.maxWidth = 'none';
  svg.style.width = `${natural.width}px`;
  svg.style.height = `${natural.height}px`;

  const state = { scale: 1, base: 1 };

  const apply = (): void => {
    svg.style.transform = `scale(${state.scale})`;
    canvas.style.width = `${Math.ceil(natural.width * state.scale)}px`;
    canvas.style.height = `${Math.ceil(natural.height * state.scale)}px`;
    figure.dataset.zoomed = Math.abs(state.scale - state.base) < 0.001 ? '0' : '1';
  };

  const fit = (): void => {
    const available = stage.clientWidth || figure.clientWidth || natural.width;
    const ratio = available / natural.width;
    state.base = Math.min(1, Math.max(ratio, MINIMUM_FIT_SCALE));
    state.scale = state.base;
    figure.dataset.clamped = ratio < MINIMUM_FIT_SCALE ? '1' : '0';
    apply();
    stage.scrollLeft = Math.max(0, (canvas.offsetWidth - stage.clientWidth) / 2);
    stage.scrollTop = 0;
  };

  const zoom = (factor: number): void => {
    const previous = state.scale;
    state.scale = Math.min(8, Math.max(0.1, state.scale * factor));
    const centreX = (stage.scrollLeft + stage.clientWidth / 2) / previous;
    const centreY = (stage.scrollTop + stage.clientHeight / 2) / previous;
    apply();
    stage.scrollLeft = centreX * state.scale - stage.clientWidth / 2;
    stage.scrollTop = centreY * state.scale - stage.clientHeight / 2;
  };

  stage.style.maxHeight = `${Math.round(MAXIMUM_STAGE_HEIGHT * 100)}vh`;
  fit();

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver === 'function') {
    let lastWidth = stage.clientWidth;
    resizeObserver = new ResizeObserver(() => {
      if (stage.clientWidth === lastWidth ||
          figure.dataset.zoomed === '1') {
        return;
      }
      lastWidth = stage.clientWidth;
      fit();
    });
    resizeObserver.observe(stage);
  }

  stage.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey &&
          !event.metaKey) {
        return;
      }
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
    },
    { passive: false },
  );

  // Drag scrolls the stage rather than translating the diagram, so it works
  // together with the scrollbars instead of fighting them.
  let dragging = false;
  let originX = 0;
  let originY = 0;
  let scrollX = 0;
  let scrollY = 0;
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    dragging = true;
    originX = event.clientX;
    originY = event.clientY;
    scrollX = stage.scrollLeft;
    scrollY = stage.scrollTop;
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-panning');
  });
  stage.addEventListener('pointermove', (event) => {
    if (!dragging) {
      return;
    }
    stage.scrollLeft = scrollX - (event.clientX - originX);
    stage.scrollTop = scrollY - (event.clientY - originY);
  });
  const endDrag = (): void => {
    dragging = false;
    stage.classList.remove('is-panning');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', fit);

  const flash = (message: string): void => {
    figure.dataset.flash = message;
    setTimeout(() => delete figure.dataset.flash, 1400);
  };

  const expandButton = button('Expand to full screen', 'expand', () => toggleFullScreen());
  let escapeHandler: ((event: KeyboardEvent) => void) | null = null;
  let previousOverflow: string | null = null;

  const leaveFullScreen = (): void => {
    if (figure.dataset.fullscreen !== '1') {
      return;
    }
    delete figure.dataset.fullscreen;
    if (previousOverflow === null ||
        previousOverflow === '') {
      document.documentElement.style.removeProperty('overflow');
    } else {
      document.documentElement.style.overflow = previousOverflow;
    }
    previousOverflow = null;
    stage.style.maxHeight = `${Math.round(MAXIMUM_STAGE_HEIGHT * 100)}vh`;
    expandButton.innerHTML = icon('expand');
    expandButton.title = 'Expand to full screen';
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler);
      escapeHandler = null;
    }
  };

  const toggleFullScreen = (): void => {
    if (figure.dataset.fullscreen === '1') {
      leaveFullScreen();
      fit();
      return;
    }

    figure.dataset.fullscreen = '1';
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    stage.style.removeProperty('max-height');
    expandButton.innerHTML = icon('collapse');
    expandButton.title = 'Exit full screen (Esc)';
    escapeHandler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        toggleFullScreen();
      }
    };
    document.addEventListener('keydown', escapeHandler);

    requestAnimationFrame(() => {
      const widthRatio = stage.clientWidth / natural.width;
      const heightRatio = stage.clientHeight / natural.height;
      state.base = Math.min(Math.max(Math.min(widthRatio, heightRatio), MINIMUM_FIT_SCALE), 4);
      state.scale = state.base;
      figure.dataset.clamped = Math.min(widthRatio, heightRatio) < MINIMUM_FIT_SCALE ? '1' : '0';
      apply();
      stage.scrollLeft = Math.max(0, (canvas.offsetWidth - stage.clientWidth) / 2);
      stage.scrollTop = 0;
    });
  };

  const toolbar = document.createElement('div');
  toolbar.className = 'usher-diagram-toolbar';
  toolbar.append(
    button('Zoom in (Ctrl + wheel)', 'zoom-in', () => zoom(1.25)),
    button('Zoom out', 'zoom-out', () => zoom(1 / 1.25)),
    button('Fit to width (double-click)', 'reset', fit),
    expandButton,
    button('Copy diagram source', 'copy', () => {
      void navigator.clipboard.writeText(source);
      flash('Copied');
    }),
    button('Download SVG', 'download', () => {
      downloadBlob(new Blob([svg.outerHTML], { type: 'image/svg+xml' }), `diagram-${index + 1}.svg`);
    }),
    button('Download PNG', 'image', () => {
      void svgToPngBlob(svg, natural)
        .then((blob) => downloadBlob(blob, `diagram-${index + 1}.png`))
        .catch(() => flash('PNG export failed'));
    }),
  );
  figure.appendChild(toolbar);

  return () => {
    leaveFullScreen();
    resizeObserver?.disconnect();
  };
}

function renderFailure(pre: HTMLElement, source: string, message: string): void {
  const figure = document.createElement('figure');
  figure.className = 'usher-diagram usher-diagram-error';
  const heading = document.createElement('div');
  heading.className = 'usher-diagram-error-title';
  heading.textContent = `Mermaid could not render this diagram — ${message}`;
  const code = document.createElement('pre');
  code.className = 'usher-code';
  code.textContent = source;
  figure.append(heading, code);
  pre.replaceWith(figure);
}export interface MermaidRenderResult {
  count: number;
  /** Tears down fullscreen state, listeners, and observers before the article is replaced. */
  dispose: () => void;
}

/**
 * Replaces every pending mermaid fence with a rendered, zoomable diagram.
 */
export async function renderMermaid(root: ParentNode, options: MermaidRenderOptions): Promise<MermaidRenderResult> {
  const disposers: Array<() => void> = [];
  const dispose = (): void => {
    for (const disposer of disposers.splice(0)) {
      disposer();
    }
  };

  const blocks = Array.from(root.querySelectorAll<HTMLElement>(`pre.${MERMAID_CLASS}[data-usher-pending]`));
  if (blocks.length === 0) {
    return { count: 0, dispose };
  }

  try {
    await ensureVendor('mermaid', options.loadVendor);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const block of blocks) {
      renderFailure(block, block.textContent ?? '', message);
    }
    return { count: blocks.length, dispose };
  }

  const mermaid = vendorGlobal<MermaidApi>('mermaid');
  if (!mermaid) {
    for (const block of blocks) {
      renderFailure(block, block.textContent ?? '', 'bundle unavailable');
    }
    return { count: blocks.length, dispose };
  }

  const theme = resolveTheme(options.theme, options.dark);
  if (initializedTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'strict',
      fontFamily: options.fontFamily,
      logLevel: 'fatal',
      // Labels are drawn as native <text> rather than HTML in a <foreignObject>,
      // which the sanitiser strips as an mXSS vector.
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: false },
      class: { htmlLabels: false, useMaxWidth: false },
      er: { useMaxWidth: false },
      sequence: { useMaxWidth: false },
      gantt: { useMaxWidth: false },
      pie: { useMaxWidth: false },
      journey: { useMaxWidth: false },
      state: { useMaxWidth: false },
    });
    initializedTheme = theme;
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const source = block.textContent ?? '';
    delete block.dataset.usherPending;
    sequence += 1;
    const id = `usher-mermaid-${sequence}`;

    const figure = document.createElement('figure');
    figure.className = 'usher-diagram';
    const stage = document.createElement('div');
    stage.className = 'usher-diagram-stage';
    const canvas = document.createElement('div');
    canvas.className = 'usher-diagram-canvas';
    stage.appendChild(canvas);
    figure.appendChild(stage);

    // Mermaid measures text with getBBox, so the stage has to be in the live
    // document before render() is called. The source block stays in place but
    // hidden, ready to be restored if rendering fails.
    block.hidden = true;
    block.insertAdjacentElement('afterend', figure);

    try {
      const { svg } = await mermaid.render(id, source, canvas);
      canvas.innerHTML = sanitizeSvg(svg);
      const element = canvas.querySelector('svg');
      if (!element) {
        throw new Error('no SVG produced');
      }
      element.removeAttribute('height');
      element.setAttribute('role', 'img');
      block.remove();
      disposers.push(attachViewport(figure, element, source, index));
    } catch (error) {
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
      figure.remove();
      block.hidden = false;
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      renderFailure(block, source, message);
    }
  }

  return { count: blocks.length, dispose };
}

export function countMermaidBlocks(root: ParentNode): number {
  return root.querySelectorAll(`pre.${MERMAID_CLASS}, figure.usher-diagram`).length;
}
