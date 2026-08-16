import * as vscode from 'vscode';
import type { MarkdownIt } from 'markdown-it';
import { admonitionsPlugin, configPlugin } from './admonitions.js';
import { activeMarkdownDocument, showUsherPreview } from './panel.js';

interface DiagramConfig {
  fitToWidth: boolean;
  minimumScale: number;
}

function builtInPreviewConfig(): DiagramConfig {
  const settings = vscode.workspace.getConfiguration('usher');
  return {
    fitToWidth: settings.get<boolean>('diagrams.fitToWidth', true),
    minimumScale: settings.get<number>('diagrams.minimumScale', 0.55),
  };
}

function openPreview(context: vscode.ExtensionContext, column: vscode.ViewColumn): void {
  const document = activeMarkdownDocument();
  if (!document) {
    void vscode.window.showInformationMessage('Open a Markdown file first.');
    return;
  }
  showUsherPreview(context.extensionUri, document, column);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('usher.openPreview', () =>
      openPreview(context, vscode.ViewColumn.Active),
    ),
    vscode.commands.registerCommand('usher.openPreviewToSide', () =>
      openPreview(context, vscode.ViewColumn.Beside),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('usher.diagrams') ||
          event.affectsConfiguration('usher.admonitions')) {
        void vscode.commands.executeCommand('markdown.preview.refresh');
      }
    }),
  );

  return {
    extendMarkdownIt(md: MarkdownIt) {
      if (vscode.workspace.getConfiguration('usher').get<boolean>('admonitions.enabled', true)) {
        md.use(admonitionsPlugin);
      }
      configPlugin(md, builtInPreviewConfig);
      return md;
    },
  };
}

export function deactivate() {}
