import * as vscode from "vscode";
import type { FrontmatterService } from "@/extension/frontmatter/service";
import type { ActiveFileTracker } from "./activeFile";
import type { ParsedLink } from "@/extension/linkgraph/parse";

export interface LinkGraphLike {
    getInbound(uri: vscode.Uri): { source: vscode.Uri; link: ParsedLink }[];
    onDidUpdate: vscode.Event<vscode.Uri[]>;
}

export type BacklinksElement =
    | { kind: "source"; sourceUri: vscode.Uri; linkCount: number; label: string }
    | { kind: "link"; sourceUri: vscode.Uri; link: ParsedLink; label: string };

export class BacklinksProvider implements vscode.TreeDataProvider<BacklinksElement>, vscode.Disposable {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<
        BacklinksElement | undefined | null | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly linkGraph: LinkGraphLike,
        private readonly frontmatter: FrontmatterService,
        private readonly activeFile: ActiveFileTracker,
    ) {
        this.disposables.push(
            activeFile.onDidChange(() => this._onDidChangeTreeData.fire()),
            linkGraph.onDidUpdate(() => this._onDidChangeTreeData.fire()),
        );
    }

    getTreeItem(element: BacklinksElement): vscode.TreeItem {
        if (element.kind === "source") {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.Collapsed,
            );
            item.contextValue = "backlinkSource";
            item.command = {
                command: "cortex.tree.openInReader",
                title: "Open in Reader",
                arguments: [element.sourceUri],
            };
            item.tooltip = element.sourceUri.fsPath;
            return item;
        } else {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.None,
            );
            item.contextValue = "backlinkLine";
            item.command = {
                command: "cortex.backlinks.openLink",
                title: "Open Link",
                arguments: [{ sourceUri: element.sourceUri, line: element.link.line }],
            };
            return item;
        }
    }

    async getChildren(parent?: BacklinksElement): Promise<BacklinksElement[]> {
        const current = this.activeFile.current();
        if (!current) {
            return [];
        }

        if (!parent) {
            return this.buildTopLevel(current);
        }

        if (parent.kind === "source") {
            return this.buildLinks(parent);
        }

        return [];
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    // ── private ───────────────────────────────────────────────────────────────

    private async buildTopLevel(current: vscode.Uri): Promise<BacklinksElement[]> {
        const inbound = this.linkGraph.getInbound(current);

        // Group by source
        const bySource = new Map<string, { sourceUri: vscode.Uri; links: ParsedLink[] }>();
        for (const { source, link } of inbound) {
            if (link.kind !== "link") {
                continue;
            }
            const key = source.toString();
            if (!bySource.has(key)) {
                bySource.set(key, { sourceUri: source, links: [] });
            }
            bySource.get(key)!.links.push(link);
        }

        const elements: BacklinksElement[] = [];
        for (const { sourceUri, links } of bySource.values()) {
            const title = await this.frontmatter.getTitle(sourceUri);
            if (!title) {
                continue;
            }
            elements.push({
                kind: "source",
                sourceUri,
                linkCount: links.length,
                label: `${title} (${links.length})`,
            });
        }

        elements.sort((a, b) => a.label.localeCompare(b.label));
        return elements;
    }

    private buildLinks(source: BacklinksElement & { kind: "source" }): BacklinksElement[] {
        const current = this.activeFile.current();
        if (!current) {
            return [];
        }

        const inbound = this.linkGraph.getInbound(current);
        const links = inbound
            .filter(
                ({ source: s, link }) =>
                    s.toString() === source.sourceUri.toString() && link.kind === "link",
            )
            .map(({ link }) => link);

        return links.map((link) => ({
            kind: "link" as const,
            sourceUri: source.sourceUri,
            link,
            label: link.lineText,
        }));
    }
}
