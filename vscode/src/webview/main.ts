import { UsherView } from '../../../src/core/render-shell.js';
import { createScriptTagLoader } from '../../../src/core/vendor-loader.js';
import { DEFAULT_SETTINGS } from '../../../src/shared/settings.js';
import type { Settings, ThemeName } from '../../../src/shared/settings.js';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const root = document.getElementById('usher-root');
if (!root) {
  throw new Error('Missing #usher-root');
}

const base = root.dataset.baseUri ?? '';
const assetUrl = (path: string): string => `${base}/${path}`;

function settingsFrom(overrides: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

const view = new UsherView({
  host: root,
  settings: settingsFrom(JSON.parse(root.dataset.settings ?? '{}') as Partial<Settings>),
  sourceUrl: root.dataset.sourceUrl ?? 'untitled.md',
  subtitle: root.dataset.subtitle ?? 'Usher',
  assetUrl,
  loadVendor: createScriptTagLoader(assetUrl),
  persistTheme: (theme: ThemeName) => vscode.postMessage({ type: 'theme', theme }),
  onTitle: (title: string) => vscode.postMessage({ type: 'title', title }),
});

let renderToken = 0;

async function show(source: string): Promise<void> {
  const token = ++renderToken;
  view.setSource(source);
  await view.render();
  if (token === renderToken) {
    vscode.postMessage({ type: 'rendered' });
  }
}

interface HostMessage {
  type?: string;
  source?: string;
  settings?: Partial<Settings>;
  ratio?: number;
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as HostMessage;
  if (message.type === 'update' &&
      typeof message.source === 'string') {
    void show(message.source);
    return;
  }
  if (message.type === 'settings' &&
      message.settings) {
    view.setSettings(settingsFrom(message.settings));
    void view.render();
    return;
  }
  if (message.type === 'scrollTo' &&
      typeof message.ratio === 'number') {
    const height = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.max(0, height * message.ratio), behavior: 'auto' });
  }
});

// Nothing is rendered until the host sends the document; rendering an empty one first
// would only make the shell decide there are no headings worth a table of contents.
vscode.postMessage({ type: 'ready' });
