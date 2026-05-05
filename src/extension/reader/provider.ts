import * as vscode from "vscode";
import * as path from "path";
import matter from "gray-matter";
import type { FrontmatterService } from "@/extension/frontmatter/service";
import type { NexusService } from "@/extension/nexus/service";
import { resolveLink } from "./links";
import type { HostMessage, ReaderFrontmatter, ThemeKind, WebviewMessage } from "./messaging";

const SIZE_LIMIT = 500 * 1024;
const PREVIEW_LIMIT = 50 * 1024;
const DEBOUNCE_MS = 150;

export class ReaderProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private currentUri: vscode.Uri | undefined;
    private webviewReady = false;
    private changeWatcher: vscode.Disposable | undefined;
    private saveWatcher: vscode.Disposable | undefined;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private themeWatcher: vscode.Disposable | undefined;

    private readonly _onDidChangeCurrentDoc = new vscode.EventEmitter<vscode.Uri | undefined>();
    readonly onDidChangeCurrentDoc = this._onDidChangeCurrentDoc.event;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly frontmatter: FrontmatterService,
        private readonly nexus: NexusService,
    ) {}

    async open(uri: vscode.Uri): Promise<void> {
        const title = (await this.frontmatter.getTitle(uri)) ?? path.basename(uri.fsPath);

        const isNewPanel = !this.panel;
        if (this.panel) {
            this.panel.title = title;
            this.panel.reveal(vscode.ViewColumn.Active);
        } else {
            this.panel = this.createPanel(title);
        }

        this.currentUri = uri;
        this._onDidChangeCurrentDoc.fire(uri);
        // For a brand-new panel the webview hasn't loaded yet — its "ready"
        // handler will fire sendInit. Sending it here too would cause two
        // simultaneous renders racing on plugin initialization.
        if (!isNewPanel && this.webviewReady) {
            await this.sendInit(uri);
        }
        this.watchSource(uri);
    }

    dispose(): void {
        this.stopWatchers();
        this.themeWatcher?.dispose();
        this._onDidChangeCurrentDoc.dispose();
        this.panel?.dispose();
    }

    private createPanel(title: string): vscode.WebviewPanel {
        const nexusRoot = this.nexus.active?.uri ?? this.extensionUri;
        const panel = vscode.window.createWebviewPanel(
            "cortex.reader",
            title,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, "out", "webviews"),
                    nexusRoot,
                ],
                retainContextWhenHidden: true,
            },
        );

        panel.webview.html = this.buildHtml(panel.webview);

        panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
            void this.handleMessage(msg);
        });

        panel.onDidDispose(() => {
            this.panel = undefined;
            this.currentUri = undefined;
            this.webviewReady = false;
            this.stopWatchers();
            this._onDidChangeCurrentDoc.fire(undefined);
        });

        this.themeWatcher?.dispose();
        this.themeWatcher = vscode.window.onDidChangeActiveColorTheme(() => {
            if (this.panel) {
                this.post({ type: "themeChanged", themeKind: getThemeKind() });
            }
        });

        return panel;
    }

    private async handleMessage(msg: WebviewMessage): Promise<void> {
        switch (msg.type) {
            case "ready":
                this.webviewReady = true;
                if (this.currentUri) {
                    await this.sendInit(this.currentUri);
                }
                break;
            case "openSource":
                if (this.currentUri) {
                    await vscode.window.showTextDocument(this.currentUri, {
                        viewColumn: vscode.ViewColumn.Beside,
                    });
                }
                break;
            case "linkClicked":
                await this.handleLinkClick(msg.href);
                break;
            case "currentDocChanged":
                await this.handleCurrentDocChanged(msg.fileUri);
                break;
            case "reload":
                if (this.currentUri) {
                    await this.sendInit(this.currentUri);
                }
                break;
            case "forceRender":
                if (this.currentUri) {
                    await this.sendInit(this.currentUri, true);
                }
                break;
        }
    }

    private async handleCurrentDocChanged(fileUriString: string): Promise<void> {
        const newUri = vscode.Uri.parse(fileUriString);
        this.currentUri = newUri;
        this._onDidChangeCurrentDoc.fire(newUri);
        if (this.panel) {
            this.panel.title =
                (await this.frontmatter.getTitle(newUri)) ?? path.basename(newUri.fsPath);
        }
        this.watchSource(newUri);
    }

    private async handleLinkClick(href: string): Promise<void> {
        if (!this.currentUri) {
            return;
        }
        const nexusRoot = this.nexus.active?.uri;
        if (!nexusRoot) {
            return;
        }
        const resolved = resolveLink(href, this.currentUri, nexusRoot);

        switch (resolved.kind) {
            case "external":
                await vscode.env.openExternal(vscode.Uri.parse(resolved.url));
                break;
            case "anchor":
                break;
            case "internal": {
                const targetUri = resolved.uri;
                const title =
                    (await this.frontmatter.getTitle(targetUri)) ??
                    path.basename(targetUri.fsPath);
                if (this.panel) {
                    this.panel.title = title;
                }
                this.currentUri = targetUri;
                await this.sendNavigateTo(targetUri, resolved.anchor);
                this.watchSource(targetUri);
                break;
            }
            case "outside-nexus": {
                const absPath = path.resolve(
                    path.dirname(this.currentUri.fsPath),
                    href.split("#")[0],
                );
                await vscode.window.showTextDocument(vscode.Uri.file(absPath));
                break;
            }
        }
    }

    private async sendInit(uri: vscode.Uri, force = false): Promise<void> {
        if (!this.panel) {
            return;
        }
        const themeKind = getThemeKind();

        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch {
            return;
        }

        if (!force && stat.size > SIZE_LIMIT) {
            let preview = "";
            try {
                const bytes = await vscode.workspace.fs.readFile(uri);
                preview = Buffer.from(bytes).toString("utf8").slice(0, PREVIEW_LIMIT);
            } catch {
                preview = "(Unable to read file)";
            }
            this.post({ type: "init", mode: "oversized", preview, sizeBytes: stat.size, themeKind });
            return;
        }

        let raw: string;
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            raw = Buffer.from(bytes).toString("utf8");
        } catch {
            raw = "";
        }

        const { content, frontmatter, baseUri } = this.parseFile(raw, uri);
        this.post({
            type: "init",
            mode: "normal",
            content,
            frontmatter,
            baseUri,
            fileUri: uri.toString(),
            themeKind,
        });
    }

    private async sendNavigateTo(uri: vscode.Uri, anchor?: string): Promise<void> {
        if (!this.panel) {
            return;
        }
        let raw: string;
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            raw = Buffer.from(bytes).toString("utf8");
        } catch {
            raw = "";
        }
        const { content, frontmatter, baseUri } = this.parseFile(raw, uri);
        this.post({
            type: "navigateTo",
            content,
            frontmatter,
            baseUri,
            fileUri: uri.toString(),
            anchor,
        });
    }

    private async sendUpdate(uri: vscode.Uri): Promise<void> {
        if (!this.panel) {
            return;
        }
        let raw: string;
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            raw = Buffer.from(bytes).toString("utf8");
        } catch {
            return;
        }
        const { content, frontmatter, baseUri } = this.parseFile(raw, uri);
        this.post({
            type: "update",
            content,
            frontmatter,
            baseUri,
            fileUri: uri.toString(),
        });
    }

    private parseFile(
        raw: string,
        uri: vscode.Uri,
    ): { content: string; frontmatter: ReaderFrontmatter; baseUri: string } {
        let parsed: matter.GrayMatterFile<string>;
        try {
            parsed = matter(raw);
        } catch {
            return { content: raw, frontmatter: {}, baseUri: this.makeBaseUri(uri) };
        }

        const data = parsed.data as Record<string, unknown>;
        const frontmatter: ReaderFrontmatter = {
            title: typeof data.title === "string" ? data.title : undefined,
            tags: Array.isArray(data.tags)
                ? (data.tags as unknown[]).filter((t): t is string => typeof t === "string")
                : undefined,
            type: typeof data.type === "string" ? data.type : undefined,
            status: typeof data.status === "string" ? data.status : undefined,
        };

        return { content: parsed.content, frontmatter, baseUri: this.makeBaseUri(uri) };
    }

    private makeBaseUri(uri: vscode.Uri): string {
        if (!this.panel) {
            return "";
        }
        const docDir = path.dirname(uri.fsPath);
        return this.panel.webview.asWebviewUri(vscode.Uri.file(docDir)).toString();
    }

    private watchSource(uri: vscode.Uri): void {
        this.stopWatchers();

        const scheduleUpdate = () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                if (this.currentUri?.toString() === uri.toString() && this.panel) {
                    void this.sendUpdate(uri);
                }
            }, DEBOUNCE_MS);
        };

        this.changeWatcher = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === uri.toString()) {
                scheduleUpdate();
            }
        });
        this.saveWatcher = vscode.workspace.onDidSaveTextDocument((doc) => {
            if (doc.uri.toString() === uri.toString()) {
                scheduleUpdate();
            }
        });
    }

    private stopWatchers(): void {
        clearTimeout(this.debounceTimer);
        this.changeWatcher?.dispose();
        this.saveWatcher?.dispose();
        this.changeWatcher = undefined;
        this.saveWatcher = undefined;
    }

    private post(msg: HostMessage): void {
        this.panel?.webview.postMessage(msg);
    }

    private buildHtml(webview: vscode.Webview): string {
        const webviewsBase = vscode.Uri.joinPath(this.extensionUri, "out", "webviews");
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewsBase, "reader.js"));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewsBase, "reader.css"));
        const nonce = getNonce();

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' ${webview.cspSource};
             style-src ${webview.cspSource} 'unsafe-inline';
             img-src ${webview.cspSource} https: data: blob:;
             font-src ${webview.cspSource} https: data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Cortex Reader</title>
</head>
<body>
  <div class="sticky-header">
    <div id="toolbar"></div>
    <div id="strip"></div>
  </div>
  <article class="markdown-body" id="content"></article>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getThemeKind(): ThemeKind {
    switch (vscode.window.activeColorTheme.kind) {
        case vscode.ColorThemeKind.Light:
            return "light";
        case vscode.ColorThemeKind.Dark:
            return "dark";
        case vscode.ColorThemeKind.HighContrast:
            return "high-contrast";
        case vscode.ColorThemeKind.HighContrastLight:
            return "high-contrast-light";
    }
}

function getNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
