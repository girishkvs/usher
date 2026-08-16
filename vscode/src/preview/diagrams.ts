import { fitDiagram, naturalWidthOf } from './fit.js';

interface PreviewConfig {
  fitToWidth: boolean;
  minimumScale: number;
}

const DEFAULTS: PreviewConfig = { fitToWidth: true, minimumScale: 0.55 };

function readConfig(): PreviewConfig {
  const holder = document.getElementById('usher-config');
  const raw = holder?.getAttribute('data-config');
  if (!raw) {
    return DEFAULTS;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PreviewConfig>;
    return {
      fitToWidth: parsed.fitToWidth ?? DEFAULTS.fitToWidth,
      minimumScale: typeof parsed.minimumScale === 'number' ? parsed.minimumScale : DEFAULTS.minimumScale,
    };
  } catch {
    return DEFAULTS;
  }
}

function availableWidthFor(container: HTMLElement): number {
  const style = getComputedStyle(container);
  const padding = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
  return Math.max(0, container.clientWidth - padding);
}

/**
 * The built-in renderer owns the SVG, so Usher only adjusts width after the fact and
 * records what it did. Re-running on an already-adjusted diagram must be harmless:
 * the preview re-renders on every keystroke.
 */
function applyFit(container: HTMLElement, config: PreviewConfig): void {
  const svg = container.querySelector('svg');
  if (!svg) {
    return;
  }

  if (!config.fitToWidth) {
    container.classList.remove('usher-diagram-scrolls');
    svg.style.removeProperty('width');
    svg.style.removeProperty('max-width');
    return;
  }

  const viewBox = svg.viewBox?.baseVal?.width ?? 0;
  const attribute = parseFloat(svg.getAttribute('width') ?? '0');
  // Measured before Usher touches the width, so a re-run cannot feed back on itself.
  const layout = svg.getBoundingClientRect().width;
  const natural = naturalWidthOf(viewBox, Number.isFinite(attribute) ? attribute : 0, layout);
  const available = availableWidthFor(container);

  const result = fitDiagram(natural, available, config.minimumScale);
  if (result.width <= 0) {
    return;
  }

  svg.style.maxWidth = 'none';
  svg.style.width = `${Math.round(result.width)}px`;
  svg.style.height = 'auto';
  container.classList.toggle('usher-diagram-scrolls', result.scrolls);
  container.setAttribute('data-usher-scale', result.scale.toFixed(3));
}

function applyAll(): void {
  const config = readConfig();
  for (const container of document.querySelectorAll<HTMLElement>('.mermaid')) {
    applyFit(container, config);
  }
}

let pending = 0;
function schedule(): void {
  if (pending) {
    return;
  }
  pending = requestAnimationFrame(() => {
    pending = 0;
    applyAll();
  });
}

// Diagrams appear asynchronously: the built-in renderer swaps SVGs in after Mermaid
// finishes, which is well after this script first runs.
const observer = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === 'childList' &&
        record.addedNodes.length > 0) {
      schedule();
      return;
    }
  }
});

function start(): void {
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
