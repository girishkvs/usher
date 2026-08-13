import { UsherView } from '../core/render-shell.js';
import { createScriptTagLoader } from '../core/vendor-loader.js';
import { loadSettings, onSettingsChanged } from '../shared/settings.js';
import { VIEWER_TRANSFER_KEY } from '../shared/messages.js';
import { WELCOME_DOCUMENT } from './welcome-doc.js';

const assetUrl = (path: string): string => chrome.runtime.getURL(path);

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element #${id}`);
  }
  return found as T;
}

async function main(): Promise<void> {
  const settings = await loadSettings();
  const host = element('host');
  const editorPane = element('editor-pane');
  const editor = element<HTMLTextAreaElement>('editor');
  const dropHint = element('drop-hint');
  const fileInput = element<HTMLInputElement>('file-input');

  const view = new UsherView({
    host,
    settings,
    sourceUrl: location.href,
    subtitle: 'Usher viewer',
    assetUrl,
    loadVendor: createScriptTagLoader(assetUrl),
    onTitle: (title) => {
      document.title = title ? `${title} — Usher` : 'Usher viewer';
    },
  });

  let source = '';
  let renderTimer: number | null = null;

  const render = async (next: string): Promise<void> => {
    source = next;
    view.setSource(next);
    await view.render();
  };

  const scheduleRender = (next: string): void => {
    if (renderTimer !== null) {
      clearTimeout(renderTimer);
    }
    renderTimer = window.setTimeout(() => void render(next), 220);
  };

  const openText = async (text: string, showEditor: boolean): Promise<void> => {
    editor.value = text;
    editorPane.hidden = !showEditor;
    await render(text);
  };

  editor.addEventListener('input', () => scheduleRender(editor.value));

  element('toggle-editor').addEventListener('click', () => {
    editorPane.hidden = !editorPane.hidden;
    if (!editorPane.hidden) {
      editor.value = source;
      editor.focus();
    }
  });

  element('open-file').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    void file.text().then((text) => {
      void openText(text, false);
      document.title = `${file.name} — Usher`;
      fileInput.value = '';
    });
  });

  element('load-sample').addEventListener('click', () => void openText(WELCOME_DOCUMENT, false));
  element('clear').addEventListener('click', () => void openText('', true));
  element('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  let dragDepth = 0;
  window.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    dropHint.hidden = false;
  });
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      dropHint.hidden = true;
    }
  });
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropHint.hidden = true;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void file.text().then((text) => {
        void openText(text, false);
        document.title = `${file.name} — Usher`;
      });
      return;
    }
    const text = event.dataTransfer?.getData('text/plain');
    if (text) {
      void openText(text, false);
    }
  });

  document.addEventListener('paste', (event) => {
    if (document.activeElement === editor) {
      return;
    }
    const text = event.clipboardData?.getData('text/plain');
    if (text &&
        text.trim()) {
      event.preventDefault();
      void openText(text, false);
    }
  });

  onSettingsChanged((next) => {
    view.setSettings(next);
    void view.render();
  });

  const params = new URLSearchParams(location.search);
  if (params.get('from') === 'transfer') {
    const stored = await chrome.storage.session.get(VIEWER_TRANSFER_KEY);
    const text = stored[VIEWER_TRANSFER_KEY];
    await chrome.storage.session.remove(VIEWER_TRANSFER_KEY);
    await openText(typeof text === 'string' ? text : WELCOME_DOCUMENT, false);
    return;
  }

  // A `?url=` parameter is deliberately not supported. The viewer runs with the
  // extension's host permissions, so honouring a URL from the address bar would let
  // any page that knows the extension id use it to fetch and render arbitrary
  // content -- including intranet and localhost -- under the extension origin.

  await openText(WELCOME_DOCUMENT, false);
}

void main();
