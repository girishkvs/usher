import { ensureVendor, vendorGlobal, type VendorLoader } from './vendor-loader.js';
import { MATH_BLOCK_CLASS, MATH_INLINE_CLASS } from './markdown.js';

interface KatexApi {
  render(tex: string, element: HTMLElement, options: Record<string, unknown>): void;
}

/** Renders every marked math node with KaTeX, loading the bundle only when needed. */
export async function renderMath(root: ParentNode, loadVendor: VendorLoader): Promise<number> {
  const inline = Array.from(root.querySelectorAll<HTMLElement>(`code.${MATH_INLINE_CLASS}`));
  const block = Array.from(root.querySelectorAll<HTMLElement>(`.${MATH_BLOCK_CLASS} > code`));
  if (inline.length === 0 &&
      block.length === 0) {
    return 0;
  }

  try {
    await ensureVendor('katex', loadVendor);
  } catch {
    return 0;
  }
  const katex = vendorGlobal<KatexApi>('katex');
  if (!katex) {
    return 0;
  }

  const paint = (element: HTMLElement, displayMode: boolean): void => {
    const tex = element.textContent ?? '';
    const target = document.createElement(displayMode ? 'div' : 'span');
    target.className = displayMode ? 'usher-katex-block' : 'usher-katex-inline';
    try {
      katex.render(tex, target, { displayMode, throwOnError: false, output: 'html', trust: false });
      element.replaceWith(target);
    } catch {
      element.classList.add('usher-math-error');
    }
  };

  for (const element of inline) {
    paint(element, false);
  }
  for (const element of block) {
    paint(element.parentElement ?? element, true);
  }

  return inline.length + block.length;
}
