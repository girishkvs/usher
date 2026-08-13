/**
 * GitHub-compatible heading slugs, with de-duplication (`-1`, `-2`, ...).
 * Kept dependency-free so anchors match the links people already have in their docs.
 */

const STRIP_PATTERN = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g;

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(STRIP_PATTERN, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class Slugger {
  private readonly seen = new Map<string, number>();

  slug(text: string): string {
    const base = slugify(text) || 'section';
    const count = this.seen.get(base) ?? 0;
    this.seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }

  reset(): void {
    this.seen.clear();
  }
}
