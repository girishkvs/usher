export interface FitResult {
  /** Width in CSS pixels to apply to the diagram. */
  width: number;
  /** Whether the container has to scroll sideways to show all of it. */
  scrolls: boolean;
  /** Effective scale relative to the diagram's natural size. */
  scale: number;
}

/**
 * Decides how wide a diagram should be drawn.
 *
 * VS Code's Mermaid renderer sets `max-width: 100%`, so a wide `flowchart LR` is
 * squeezed to whatever the preview column happens to be -- measured at 0.46x on a
 * 2263px diagram, which shrinks the labels past readability. Below `minimumScale`
 * Usher stops shrinking and lets the diagram scroll instead.
 */
export function fitDiagram(naturalWidth: number, availableWidth: number, minimumScale: number): FitResult {
  const natural = naturalWidth > 0 ? naturalWidth : 0;
  const available = availableWidth > 0 ? availableWidth : 0;
  const floor = clampScale(minimumScale);

  if (natural === 0 ||
      available === 0) {
    return { width: natural, scrolls: false, scale: 1 };
  }

  if (natural <= available) {
    return { width: natural, scrolls: false, scale: 1 };
  }

  const fitted = available / natural;
  if (fitted >= floor) {
    return { width: available, scrolls: false, scale: fitted };
  }

  return { width: natural * floor, scrolls: true, scale: floor };
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.55;
  }
  return Math.min(1, Math.max(0.1, value));
}

/** Natural size of a rendered Mermaid SVG, preferring the viewBox over the layout box. */
export function naturalWidthOf(viewBoxWidth: number, attributeWidth: number, layoutWidth: number): number {
  if (viewBoxWidth > 0) {
    return viewBoxWidth;
  }
  if (attributeWidth > 0) {
    return attributeWidth;
  }
  return layoutWidth > 0 ? layoutWidth : 0;
}
