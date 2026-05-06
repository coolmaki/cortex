import * as vscode from "vscode";
import * as path from "path";
import type { FrontmatterService } from "@/extension/frontmatter/service";
import type { NexusService } from "@/extension/nexus/service";
import type { ActiveFileTracker } from "@/extension/backlinks/activeFile";
import type { ParsedLink } from "@/extension/linkgraph/parse";
import { resolveHref } from "@/extension/linkgraph/resolve";
import { buildGraph } from "./derive";
import type { GraphData, HostMessage, WebviewMessage, ThemeKind } from "./messaging";

export interface GraphLinkGraph {
    getAllTrackedUris(): vscode.Uri[];
    getOutbound(uri: vscode.Uri): ParsedLink[];
    onDidUpdate: vscode.Event<vscode.Uri[]>;
}

export class GraphProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private webviewReady = false;
    private readonly disposables: vscode.Disposable[] = [];
    private themeWatcher: vscode.Disposable | undefined;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly nexus: NexusService,
        private readonly linkGraph: GraphLinkGraph,
        private readonly frontmatter: FrontmatterService,
        private readonly activeFile: ActiveFileTracker,
    ) {
        this.disposables.push(
            linkGraph.onDidUpdate(() => {
                if (this.panel && this.webviewReady) {
                    void this.sendUpdate();
                }
            }),
            activeFile.onDidChange((uri) => {
                if (this.panel && this.webviewReady) {
                    this.post({ type: "activeFileChanged", uri: uri?.toString() });
                }
            }),
        );
    }

    open(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Active);
            return;
        }

        this.panel = this.createPanel();
    }

    disposePanel(): void {
        this.panel?.dispose();
        this.panel = undefined;
        this.webviewReady = false;
    }

    dispose(): void {
        this.disposePanel();
        this.themeWatcher?.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    private createPanel(): vscode.WebviewPanel {
        const panel = vscode.window.createWebviewPanel(
            "cortex.graph",
            "Cortex Graph",
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "out", "webviews")],
                retainContextWhenHidden: true,
            },
        );

        panel.webview.html = this.buildHtml(panel.webview);

        panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
            void this.handleMessage(msg);
        });

        panel.onDidDispose(() => {
            this.panel = undefined;
            this.webviewReady = false;
            this.themeWatcher?.dispose();
            this.themeWatcher = undefined;
        });

        this.themeWatcher?.dispose();
        this.themeWatcher = vscode.window.onDidChangeActiveColorTheme(() => {
            if (this.panel && this.webviewReady) {
                this.post({ type: "themeChanged", themeKind: getThemeKind() });
            }
        });

        return panel;
    }

    private async handleMessage(msg: WebviewMessage): Promise<void> {
        switch (msg.type) {
            case "ready":
                this.webviewReady = true;
                await this.sendInit();
                break;
            case "openNode":
                await vscode.commands.executeCommand(
                    "cortex.tree.openInReader",
                    vscode.Uri.parse(msg.uri),
                );
                break;
            case "reload":
                await this.sendInit();
                break;
        }
    }

    private async sendInit(): Promise<void> {
        if (!this.panel) {
            return;
        }
        const nexusRoot = this.nexus.active?.uri;
        if (!nexusRoot) {
            this.post({ type: "init", mode: "empty", reason: "no-nexus" });
            return;
        }

        const graph = await this.buildGraphData(nexusRoot);
        if (graph.nodes.length === 0) {
            this.post({ type: "init", mode: "empty", reason: "no-docs" });
            return;
        }

        this.post({
            type: "init",
            mode: "normal",
            graph,
            themeKind: getThemeKind(),
        });
    }

    private async sendUpdate(): Promise<void> {
        if (!this.panel) {
            return;
        }
        const nexusRoot = this.nexus.active?.uri;
        if (!nexusRoot) {
            return;
        }
        const graph = await this.buildGraphData(nexusRoot);
        this.post({ type: "update", graph });
    }

    private async buildGraphData(nexusRoot: vscode.Uri): Promise<GraphData> {
        const uris = this.linkGraph.getAllTrackedUris();

        const titleResults = await Promise.all(
            uris.map(async (uri) => ({
                uriString: uri.toString(),
                relPath: path.relative(nexusRoot.fsPath, uri.fsPath).replace(/\\/g, "/"),
                title: await this.frontmatter.getTitle(uri),
            })),
        );

        const allUris = titleResults.map((r) => ({ uriString: r.uriString, relPath: r.relPath }));
        const titleMap = new Map(titleResults.map((r) => [r.uriString, r.title]));

        const getTitle = (uriString: string) => titleMap.get(uriString) ?? null;

        const getOutboundUris = (uriString: string): string[] => {
            const uri = vscode.Uri.parse(uriString);
            const links = this.linkGraph.getOutbound(uri);
            return links
                .map((l) => {
                    const resolved = resolveHref(l.href, uri.fsPath, nexusRoot.fsPath);
                    if (!resolved) {
                        return null;
                    }
                    return vscode.Uri.file(resolved).toString();
                })
                .filter((u): u is string => u !== null);
        };

        return buildGraph(allUris, getTitle, getOutboundUris);
    }

    private post(msg: HostMessage): void {
        this.panel?.webview.postMessage(msg);
    }

    private buildHtml(webview: vscode.Webview): string {
        const webviewsBase = vscode.Uri.joinPath(this.extensionUri, "out", "webviews");
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewsBase, "graph.js"));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewsBase, "graph.css"));
        const nonce = getNonce();

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}' ${webview.cspSource};
             style-src ${webview.cspSource} 'unsafe-inline';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Cortex Graph</title>
</head>
<body>
  <header class="graph-header">
    <input type="text" id="search" placeholder="Search…" autocomplete="off" spellcheck="false">
  </header>
  <div id="empty-state" class="graph-empty" hidden>
    <p id="empty-message"></p>
  </div>
  <div id="graph-container"></div>
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
