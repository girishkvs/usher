import { loadSettings, patchSettings, toggleInList, type Settings } from '../shared/settings.js';
import { siteKeyFor } from '../shared/md-detect.js';
import type { RendererCommand, StatusResponse } from '../shared/messages.js';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing element #${id}`);
  }
  return found as T;
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendCommand(command: RendererCommand['command']): Promise<void> {
  const tab = await activeTab();
  if (tab?.id === undefined) {
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'usher:command', command });
    window.close();
  } catch {
    setStatus('This page is not rendered yet.');
  }
}

function setStatus(text: string): void {
  element('status-line').textContent = text;
}

async function readStatus(tabId: number): Promise<StatusResponse | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, { type: 'usher:status-request' })) as StatusResponse;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const settings = await loadSettings();
  const tab = await activeTab();
  const url = tab?.url ?? '';
  const siteKey = siteKeyFor(url);

  const enabled = element<HTMLInputElement>('enabled');
  const mode = element<HTMLSelectElement>('mode');
  const theme = element<HTMLSelectElement>('theme');
  const siteEnabled = element<HTMLInputElement>('site-enabled');

  enabled.checked = settings.enabled;
  mode.value = settings.mode;
  theme.value = settings.theme;
  siteEnabled.checked = settings.siteAllowList.includes(siteKey);
  element('site-label').textContent =
    siteKey === 'file://' ? 'Always render local files' : `Always render on ${siteKey || 'this site'}`;

  enabled.addEventListener('change', () => void patchSettings({ enabled: enabled.checked }));
  mode.addEventListener('change', () => void patchSettings({ mode: mode.value as Settings['mode'] }));
  theme.addEventListener('change', () => void patchSettings({ theme: theme.value as Settings['theme'] }));
  siteEnabled.addEventListener('change', () => {
    void loadSettings().then((current) =>
      patchSettings({
        siteAllowList: toggleInList(current.siteAllowList, siteKey, siteEnabled.checked),
        siteDenyList: siteEnabled.checked
          ? current.siteDenyList.filter((entry) => entry !== siteKey)
          : current.siteDenyList,
      }),
    );
  });

  element('render').addEventListener('click', () => {
    if (tab?.id === undefined) {
      return;
    }
    void chrome.runtime
      .sendMessage({ type: 'usher:force-render', tabId: tab.id, source: 'document' })
      .then(() => window.close());
  });
  element('toggle-raw').addEventListener('click', () => void sendCommand('toggle-raw'));
  element('toggle-toc').addEventListener('click', () => void sendCommand('toggle-toc'));
  element('copy-html').addEventListener('click', () => void sendCommand('copy-html'));
  element('print').addEventListener('click', () => void sendCommand('print'));
  element('viewer').addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'usher:open-viewer' }).then(() => window.close());
  });
  element('options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  const allowsFileUrls = await chrome.extension.isAllowedFileSchemeAccess();
  if (!allowsFileUrls) {
    element('file-access-warning').hidden = false;
    element('open-file-access').addEventListener('click', () => {
      void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    });
  }

  if (tab?.id === undefined) {
    setStatus('No active tab');
    return;
  }

  const status = await readStatus(tab.id);
  if (!status?.rendered) {
    setStatus(url.startsWith('chrome') ? 'Browser page — cannot render' : 'Not rendered');
    return;
  }

  setStatus(status.title || 'Rendered');
  const stats: string[] = [`${status.words.toLocaleString()} words`];
  if (status.headings > 0) {
    stats.push(`${status.headings} headings`);
  }
  if (status.mermaidDiagrams > 0) {
    stats.push(`${status.mermaidDiagrams} diagrams`);
  }
  element('doc-stats').textContent = stats.join(' · ');
}

void main();
