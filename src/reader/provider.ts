import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FrontmatterService } from '../frontmatter/service';

export class ReaderProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private currentUri: vscode.Uri | undefined;
  private readonly frontmatter: FrontmatterService;

  constructor(
    private readonly extensionUri: vscode.Uri,
    frontmatterService: FrontmatterService,
  ) {
    this.frontmatter = frontmatterService;
  }

  async open(uri: vscode.Uri): Promise<void> {
    const title = (await this.frontmatter.getTitle(uri)) ?? path.basename(uri.fsPath);

    if (this.panel) {
      // Reuse the existing panel
      this.panel.title = title;
      this.panel.reveal(vscode.ViewColumn.Active);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'cortex.reader',
        title,
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webviews'),
          ],
          retainContextWhenHidden: true,
        },
      );
      this.panel.webview.html = this.buildHtml(this.panel.webview);
      this.panel.webview.onDidReceiveMessage((msg: { type: string }) => {
        if (msg.type === 'ready') {
          this.sendContent();
        } else if (msg.type === 'openSource' && this.currentUri) {
          vscode.window.showTextDocument(this.currentUri, {
            viewColumn: vscode.ViewColumn.Beside,
          });
        }
      });
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.currentUri = undefined;
      });
    }

    this.currentUri = uri;
    await this.sendContent();
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private async sendContent(): Promise<void> {
    if (!this.panel || !this.currentUri) return;
    let content: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(this.currentUri);
      content = Buffer.from(bytes).toString('utf8');
    } catch {
      content = '(Unable to read file)';
    }
    this.panel.webview.postMessage({ type: 'init', content });
  }

  private buildHtml(webview: vscode.Webview): string {
    const webviewsBase = vscode.Uri.joinPath(this.extensionUri, 'out', 'webviews', 'reader');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewsBase, 'reader.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewsBase, 'reader.css'));
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' ${webview.cspSource};
             style-src ${webview.cspSource};
             img-src ${webview.cspSource} https: data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Cortex Reader</title>
</head>
<body>
  <header>
    <button id="edit-source">Edit Source</button>
  </header>
  <main>
    <pre id="content"></pre>
  </main>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
