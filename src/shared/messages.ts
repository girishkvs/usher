import type { Settings } from './settings.js';

/** Content script -> background: this document is markdown, please inject the renderer. */
export interface RenderRequest {
  type: 'usher:render-request';
  reason: string;
}

/** Popup -> background: force rendering of the active tab, even for HTML pages. */
export interface ForceRenderRequest {
  type: 'usher:force-render';
  tabId: number;
  source: 'document' | 'selection';
}

/** Renderer -> background: a mermaid or katex diagram was found, load the lazy bundle. */
export interface VendorRequest {
  type: 'usher:load-vendor';
  vendor: 'mermaid' | 'katex';
}

/** Popup -> renderer, via tab messaging. */
export interface RendererCommand {
  type: 'usher:command';
  command: 'toggle-raw' | 'toggle-toc' | 'toggle-render' | 'print' | 'copy-html' | 'reload';
}

/** Renderer -> popup: current page state, so the popup can show accurate toggles. */
export interface StatusRequest {
  type: 'usher:status-request';
}

export interface StatusResponse {
  rendered: boolean;
  raw: boolean;
  tocVisible: boolean;
  headings: number;
  mermaidDiagrams: number;
  words: number;
  title: string;
}

export interface SettingsBroadcast {
  type: 'usher:settings';
  settings: Settings;
}

export interface OpenViewerRequest {
  type: 'usher:open-viewer';
  text?: string;
}

export type UsherMessage =
  | RenderRequest
  | ForceRenderRequest
  | VendorRequest
  | RendererCommand
  | StatusRequest
  | SettingsBroadcast
  | OpenViewerRequest;

export const VIEWER_TRANSFER_KEY = 'usher.viewer.transfer';
