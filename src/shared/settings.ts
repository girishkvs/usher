import type { AutoRenderMode } from './md-detect.js';

export type ThemeName = 'auto' | 'light' | 'dark' | 'github' | 'sepia' | 'high-contrast';
export type MermaidTheme = 'auto' | 'default' | 'dark' | 'forest' | 'neutral';
export type ContentWidth = 'narrow' | 'normal' | 'wide' | 'full';

export interface Settings {
  enabled: boolean;
  mode: AutoRenderMode;
  theme: ThemeName;
  contentWidth: ContentWidth;
  fontSize: number;
  showToc: boolean;
  tocCollapsed: boolean;
  showFrontMatter: boolean;
  syntaxHighlight: boolean;
  lineNumbers: boolean;
  copyButtons: boolean;
  headingAnchors: boolean;
  mermaid: boolean;
  mermaidTheme: MermaidTheme;
  math: boolean;
  emoji: boolean;
  linkify: boolean;
  typographer: boolean;
  autoReload: boolean;
  autoReloadIntervalMs: number;
  scrollPosition: boolean;
  siteAllowList: string[];
  siteDenyList: string[];
  customCss: string;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: 'extension',
  theme: 'auto',
  contentWidth: 'normal',
  fontSize: 16,
  showToc: true,
  tocCollapsed: false,
  showFrontMatter: true,
  syntaxHighlight: true,
  lineNumbers: false,
  copyButtons: true,
  headingAnchors: true,
  mermaid: true,
  mermaidTheme: 'auto',
  math: false,
  emoji: true,
  linkify: true,
  typographer: false,
  autoReload: true,
  autoReloadIntervalMs: 1500,
  scrollPosition: true,
  siteAllowList: [],
  siteDenyList: [],
  customCss: '',
};

const STORAGE_KEY = 'usher.settings';

function coerce(stored: unknown): Settings {
  if (typeof stored !== 'object' ||
      stored === null) {
    return { ...DEFAULT_SETTINGS };
  }
  const merged = { ...DEFAULT_SETTINGS } as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (!(key in DEFAULT_SETTINGS)) {
      continue;
    }
    const fallback = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
    if (Array.isArray(fallback)) {
      merged[key] = Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : fallback;
    } else if (typeof value === typeof fallback) {
      merged[key] = value;
    }
  }
  return merged as unknown as Settings;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    return coerce(stored[STORAGE_KEY]);
  } catch {
    const local = await chrome.storage.local.get(STORAGE_KEY);
    return coerce(local[STORAGE_KEY]);
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await saveSettings(next);
  return next;
}

export function onSettingsChanged(handler: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area !== 'sync' && area !== 'local') ||
        !changes[STORAGE_KEY]) {
      return;
    }
    handler(coerce(changes[STORAGE_KEY].newValue));
  });
}

export function toggleInList(list: string[], value: string, present: boolean): string[] {
  const without = list.filter((entry) => entry !== value);
  return present ? [...without, value] : without;
}
