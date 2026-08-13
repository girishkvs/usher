import { load } from 'js-yaml';

export interface FrontMatter {
  /** Parsed mapping, or null when there was no front matter or it was not a mapping. */
  data: Record<string, unknown> | null;
  /** Document body with the front matter block removed. */
  body: string;
  /** Raw front matter text, useful for showing it verbatim when parsing fails. */
  raw: string;
  error: string | null;
}

const FENCE_PATTERN = /^(---|\+\+\+)[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*(?:\r?\n|$)/;

/**
 * Splits leading YAML (---) or TOML-fenced (+++) front matter off a document.
 * TOML bodies are returned raw rather than parsed -- we only parse YAML.
 */
export function splitFrontMatter(source: string): FrontMatter {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const match = FENCE_PATTERN.exec(text);
  if (!match) {
    return { data: null, body: text, raw: '', error: null };
  }

  const [full, fence, raw] = match;
  const body = text.slice(full.length);
  if (fence === '+++') {
    return { data: null, body, raw, error: null };
  }

  try {
    const parsed = load(raw);
    const isMapping = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    return {
      data: isMapping ? (parsed as Record<string, unknown>) : null,
      body,
      raw,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      body,
      raw,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Flattens a front matter value to a short single-line string for the metadata table. */
export function formatFrontMatterValue(value: unknown): string {
  if (value === null ||
      value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(formatFrontMatterValue).join(', ');
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${key}: ${formatFrontMatterValue(nested)}`)
      .join(', ');
  }
  return String(value);
}
