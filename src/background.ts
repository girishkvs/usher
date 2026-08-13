import type {
  ForceRenderRequest,
  OpenViewerRequest,
  RenderRequest,
  UsherMessage,
  VendorRequest,
} from './shared/messages.js';

const RENDERER_FILE = 'renderer.js';
const VIEWER_TRANSFER_KEY = 'usher.viewer.transfer';

async function injectRenderer(tabId: number, frameId: number, force: 'document' | 'selection' | null): Promise<void> {
  if (force) {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: (mode: string) => {
        (globalThis as Record<string, unknown>).__usherForce = mode;
      },
      args: [force],
    });
  }
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files: [RENDERER_FILE],
  });
}

async function injectVendor(tabId: number, frameId: number, vendor: VendorRequest['vendor']): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files: [`vendor/${vendor}.js`],
  });
}

async function openViewer(text?: string): Promise<void> {
  if (text) {
    await chrome.storage.session.set({ [VIEWER_TRANSFER_KEY]: text });
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html${text ? '?from=transfer' : ''}`) });
}

async function setBadge(tabId: number, on: boolean): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: on ? 'MD' : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#4c6ef5' });
  } catch {
    // The tab may already be gone; badges are cosmetic.
  }
}

chrome.runtime.onMessage.addListener((message: UsherMessage, sender, sendResponse) => {
  if (message.type === 'usher:render-request') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ ok: false });
      return false;
    }
    const frameId = sender.frameId ?? 0;
    void injectRenderer(tabId, frameId, null)
      .then(() => setBadge(tabId, true))
      .then(() => sendResponse({ ok: true, reason: (message as RenderRequest).reason }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === 'usher:force-render') {
    const request = message as ForceRenderRequest;
    void injectRenderer(request.tabId, 0, request.source)
      .then(() => setBadge(request.tabId, true))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === 'usher:load-vendor') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ ok: false });
      return false;
    }
    void injectVendor(tabId, sender.frameId ?? 0, (message as VendorRequest).vendor)
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === 'usher:open-viewer') {
    void openViewer((message as OpenViewerRequest).text).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener((details) => {
  void chrome.contextMenus.removeAll().then(() => {
    chrome.contextMenus.create({
      id: 'usher-render-selection',
      title: 'Render selection as Markdown',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'usher-render-page',
      title: 'Render this page as Markdown',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'usher-open-viewer',
      title: 'Open Usher viewer',
      contexts: ['action'],
    });
  });

  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html?welcome=1') });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'usher-render-selection') {
    void openViewer(info.selectionText ?? '');
    return;
  }
  if (info.menuItemId === 'usher-open-viewer') {
    void openViewer();
    return;
  }
  if (info.menuItemId === 'usher-render-page' &&
      tab?.id !== undefined) {
    void injectRenderer(tab.id, 0, 'document').then(() => setBadge(tab.id as number, true));
  }
});

chrome.commands?.onCommand.addListener((command, tab) => {
  if (tab?.id === undefined) {
    return;
  }
  if (command === 'toggle-render') {
    void chrome.tabs.sendMessage(tab.id, { type: 'usher:command', command: 'toggle-render' }).catch(() => {
      void injectRenderer(tab.id as number, 0, 'document');
    });
    return;
  }
  if (command === 'open-viewer') {
    void openViewer();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    void setBadge(tabId, false);
  }
});
