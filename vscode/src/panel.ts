import * as vscode from 'vscode';

const VIEW_TYPE = 'usher.preview';

/** One live panel per document, so re-running the command reveals rather than duplicates. */
const panels = new Map<string, UsherPreviewPanel>();

export function activeMarkdownDocument(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor &&
      editor.document.languageId === 'markdown') {
    return editor.document;
  }
  return vscode.workspace.textDocuments.find((doc) => doc.languageId === 'markdown');
}

export function showUsherPreview(
  extensionUri: vscode.Uri,
  document: vscode.TextDocument,
  column: vscode.ViewColumn,
): void {
  const key = document.uri.toString();
  const existing = panels.get(key);
  if (existing) {
    existing.reveal(column);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    `Usher: ${document.uri.path.split('/').pop() ?? 'Preview'}`,
    { viewColumn: column, preserveFocus: true },
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
    },
  );
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.png');
  panels.set(key, new UsherPreviewPanel(panel, extensionUri, document));
}

/** Settings the Usher renderer understands, mapped from the `usher.*` configuration. */
function rendererSettings(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration('usher');
  return {
    theme: config.get<string>('preview.theme', 'auto'),
    contentWidth: config.get<string>('preview.contentWidth', 'normal'),
    fontSize: config.get<number>('preview.fontSize', 16),
    showToc: config.get<boolean>('preview.showToc', true),
    tocCollapsed: false,
    mermaid: true,
    mermaidTheme: config.get<string>('preview.mermaidTheme', 'auto'),
    math: config.get<boolean>('preview.math', true),
    syntaxHighlight: true,
    copyButtons: true,
    headingAnchors: true,
    emoji: true,
    linkify: true,
    lineNumbers: config.get<boolean>('preview.lineNumbers', false),
    showFrontMatter: config.get<boolean>('preview.showFrontMatter', true),
    customCss: config.get<string>('preview.customCss', ''),
  };
}

function nonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

class UsherPreviewPanel {
  private readonly disposables: vscode.Disposable[] = [];

  private ready = false;

  private pending: string | null = null;

  constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private document: vscode.TextDocument,
  ) {
    this.panel.webview.html = this.html();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message: { type?: string; theme?: string; title?: string }) => {
        if (message.type === 'ready') {
          this.ready = true;
          this.push(this.pending ?? this.document.getText());
          this.pending = null;
          return;
        }
        if (message.type === 'theme' &&
            message.theme) {
          void vscode.workspace
            .getConfiguration('usher')
            .update('preview.theme', message.theme, vscode.ConfigurationTarget.Global);
        }
      },
      null,
      this.disposables,
    );

    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.uri.toString() === this.document.uri.toString()) {
          this.push(event.document.getText());
        }
      },
      null,
      this.disposables,
    );

    vscode.workspace.onDidCloseTextDocument(
      (closed) => {
        if (closed.uri.toString() === this.document.uri.toString()) {
          this.panel.dispose();
        }
      },
      null,
      this.disposables,
    );

    vscode.workspace.onDidChangeConfiguration(
      (event) => {
        if (event.affectsConfiguration('usher.preview')) {
          this.panel.webview.postMessage({ type: 'settings', settings: rendererSettings() });
        }
      },
      null,
      this.disposables,
    );
  }

  reveal(column: vscode.ViewColumn): void {
    this.panel.reveal(column);
  }

  private push(source: string): void {
    if (!this.ready) {
      this.pending = source;
      return;
    }
    void this.panel.webview.postMessage({ type: 'update', source });
  }

  private html(): string {
    const webview = this.panel.webview;
    const dist = vscode.Uri.joinPath(this.extensionUri, 'dist');
    const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, name));
    const scriptNonce = nonce();

    // Vendor bundles load as plain script tags at runtime, so the policy allows the
    // extension's own resource origin rather than a nonce for those.
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${scriptNonce}' ${webview.cspSource}`,
    ].join('; ');

    const settings = JSON.stringify(rendererSettings()).replace(/"/g, '&quot;');
    const name = this.document.uri.path.split('/').pop() ?? 'document.md';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${asset('styles/usher.css')}">
<link rel="stylesheet" href="${asset('styles/ui.css')}">
<link rel="stylesheet" href="${asset('vendor/katex/katex.min.css')}">
<title>Usher</title>
</head>
<body>
<div id="usher-root"
     data-base-uri="${asset('.')}"
     data-source-url="${name}"
     data-subtitle="Usher preview"
     data-settings="${settings}"></div>
<script nonce="${scriptNonce}" src="${asset('webview.js')}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    panels.delete(this.document.uri.toString());
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}
