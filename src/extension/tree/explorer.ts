import * as vscode from "vscode";
import * as path from "path";
import type { NexusService } from "@/extension/nexus/service";
import { FrontmatterService } from "@/extension/frontmatter/service";
import { IgnoreService } from "@/extension/ignore/service";
import { GroupingService } from "@/extension/grouping/service";
import type { SiblingEntry } from "@/extension/grouping/service";

const INDEX_NAMES = ["README.md", "INDEX.md", "index.md"];
const DEBOUNCE_MS = 100;

export type CortexNodeKind = "file" | "folder";

export interface CortexNode {
    kind: CortexNodeKind;
    uri: vscode.Uri;
    label: string;
    /** For folders: the URI of the merged index file, if one exists. */
    indexUri?: vscode.Uri;
    /** Logical parent: child URIs to show when this node is expanded. */
    logicalChildUris?: vscode.Uri[];
    /** Composite ID for tree element identity (logical parents/children). */
    nodeId?: string;
    /** Parent node reference for getParent() on logical children. */
    parentNode?: CortexNode;
}

export class CortexExplorerProvider implements vscode.TreeDataProvider<CortexNode> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<
        CortexNode | undefined | null | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly frontmatter: FrontmatterService;
    private readonly grouping: GroupingService;
    private ignoreService: IgnoreService | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly nexus: NexusService) {
        this.frontmatter = new FrontmatterService();
        this.grouping = new GroupingService();
        nexus.onDidChangeActive(() => this.onNexusChanged());
        this.onNexusChanged();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(node: CortexNode): vscode.TreeItem {
        const collapsible =
            node.kind === "folder" || node.logicalChildUris !== undefined
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;

        const item = new vscode.TreeItem(node.label, collapsible);

        item.resourceUri = node.uri;

        if (node.nodeId) {
            item.id = node.nodeId;
        }

        if (node.kind === "file") {
            item.contextValue = "cortexFile";
            item.command = {
                command: "cortex.tree.openInReader",
                title: "Open in Reader",
                arguments: [node.uri],
            };
            item.tooltip = node.uri.fsPath;
        } else {
            item.contextValue = node.indexUri ? "cortexFolderWithIndex" : "cortexFolder";
            if (node.indexUri) {
                item.command = {
                    command: "cortex.tree.openInReader",
                    title: "Open in Reader",
                    arguments: [node.indexUri],
                };
                item.tooltip = node.indexUri.fsPath;
            }
        }

        return item;
    }

    async getChildren(parent?: CortexNode): Promise<CortexNode[]> {
        const active = this.nexus.active;
        if (!active) {
            return [this.noNexusNode()];
        }

        // Logical parent: return its logical children
        if (parent?.logicalChildUris) {
            return this.buildLogicalChildren(parent);
        }

        const dir = parent?.uri ?? active.uri;
        return this.buildChildren(dir, active.uri, parent?.indexUri);
    }

    getParent(node: CortexNode): CortexNode | undefined {
        return node.parentNode ?? undefined;
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
        this.ignoreService?.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    // ── private ───────────────────────────────────────────────────────────────

    private async onNexusChanged(): Promise<void> {
        this.ignoreService?.dispose();
        this.ignoreService = undefined;
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
        this.frontmatter.invalidateAll();

        const active = this.nexus.active;
        if (!active) {
            this.refresh();
            return;
        }

        this.ignoreService = new IgnoreService(active.uri);
        await this.ignoreService.load();

        const mdWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(active.uri, "**/*.md"),
        );
        const scheduleRefresh = (uri: vscode.Uri) => {
            this.frontmatter.invalidate(uri);
            this.scheduleRefresh();
        };
        this.disposables.push(
            mdWatcher,
            mdWatcher.onDidCreate(scheduleRefresh),
            mdWatcher.onDidDelete(scheduleRefresh),
            mdWatcher.onDidChange(scheduleRefresh),
        );

        this.ignoreService.watchForChanges(() => this.scheduleRefresh());

        this.refresh();
    }

    private scheduleRefresh(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.refresh();
            this.debounceTimer = undefined;
        }, DEBOUNCE_MS);
    }

    private async buildChildren(
        dirUri: vscode.Uri,
        nexusRoot: vscode.Uri,
        parentIndexUri?: vscode.Uri,
    ): Promise<CortexNode[]> {
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(dirUri);
        } catch {
            return [];
        }

        // Build sibling set for grouping
        const siblingEntries: SiblingEntry[] = [];
        const fileUriMap = new Map<string, vscode.Uri>();

        for (const [name, type] of entries) {
            const uri = vscode.Uri.joinPath(dirUri, name);
            const relPath = path.relative(nexusRoot.fsPath, uri.fsPath);

            if (this.shouldSkip(name, uri)) {
                continue;
            }
            if (parentIndexUri && uri.toString() === parentIndexUri.toString()) {
                continue;
            }

            const isDirectory = type === vscode.FileType.Directory;
            const isIndex = !isDirectory && INDEX_NAMES.includes(name);
            const uriStr = uri.toString();
            fileUriMap.set(uriStr, uri);

            if (isDirectory) {
                siblingEntries.push({ uri: uriStr, basename: name, isDirectory: true, isIndex: false });
            } else if (name.endsWith(".md")) {
                const fm = await this.frontmatter.parse(uri);
                if (fm) {
                    const group = Array.isArray(fm.data.group)
                        ? (fm.data.group as unknown[]).filter((g): g is string => typeof g === "string")
                        : undefined;
                    siblingEntries.push({
                        uri: uriStr,
                        basename: name,
                        isDirectory: false,
                        isIndex,
                        group,
                    });
                }
            }

            void relPath;
        }

        const { logicalChildren, suppressedSiblings } = this.grouping.resolve(siblingEntries);

        const nodes: CortexNode[] = [];

        for (const sibling of siblingEntries) {
            if (suppressedSiblings.has(sibling.uri)) {
                continue;
            }

            const uri = fileUriMap.get(sibling.uri);
            if (!uri) {
                continue;
            }

            if (sibling.isDirectory) {
                const folderNode = await this.buildFolderNode(uri, path.relative(nexusRoot.fsPath, uri.fsPath));
                if (folderNode) {
                    nodes.push(folderNode);
                }
            } else if (!sibling.isIndex) {
                const title = await this.frontmatter.getTitle(uri);
                if (title) {
                    const childUriStrings = logicalChildren.get(sibling.uri);
                    if (childUriStrings) {
                        const logicalChildUris = childUriStrings.map((s) => {
                            const childUri = fileUriMap.get(s);
                            return childUri ?? vscode.Uri.parse(s);
                        });
                        const nodeId = sibling.uri;
                        nodes.push({
                            kind: "file",
                            uri,
                            label: title,
                            logicalChildUris,
                            nodeId,
                        });
                    } else {
                        nodes.push({ kind: "file", uri, label: title });
                    }
                }
            }
        }

        // Sort: folders first, then files, each alphabetically by label
        nodes.sort((a, b) => {
            if (a.kind !== b.kind) {
                return a.kind === "folder" ? -1 : 1;
            }
            return a.label.localeCompare(b.label);
        });

        return nodes;
    }

    private async buildLogicalChildren(parent: CortexNode): Promise<CortexNode[]> {
        const children: CortexNode[] = [];
        const parentNodeId = parent.nodeId ?? parent.uri.toString();

        for (const childUri of parent.logicalChildUris!) {
            let stat: vscode.FileStat;
            try {
                stat = await vscode.workspace.fs.stat(childUri);
            } catch {
                continue;
            }

            const nodeId = `${parentNodeId}::${childUri.toString()}`;

            if (stat.type === vscode.FileType.Directory) {
                const nexusRoot = this.nexus.active?.uri;
                if (!nexusRoot) {
                    continue;
                }
                const relPath = path.relative(nexusRoot.fsPath, childUri.fsPath);
                const folderNode = await this.buildFolderNode(childUri, relPath);
                if (folderNode) {
                    children.push({ ...folderNode, nodeId, parentNode: parent });
                }
            } else {
                const title = await this.frontmatter.getTitle(childUri);
                if (title) {
                    children.push({
                        kind: "file",
                        uri: childUri,
                        label: title,
                        nodeId,
                        parentNode: parent,
                    });
                }
            }
        }

        children.sort((a, b) => a.label.localeCompare(b.label));
        return children;
    }

    private async buildFolderNode(
        uri: vscode.Uri,
        relPath: string,
    ): Promise<CortexNode | undefined> {
        let indexUri: vscode.Uri | undefined;
        let label: string = path.basename(uri.fsPath);

        for (const indexName of INDEX_NAMES) {
            const candidate = vscode.Uri.joinPath(uri, indexName);
            if (this.ignoreService?.isIgnored(candidate)) {
                continue;
            }
            const title = await this.frontmatter.getTitle(candidate);
            if (title) {
                indexUri = candidate;
                label = title;
                break;
            }
        }

        const hasContent = await this.folderHasVisibleContent(uri, relPath, indexUri);
        if (!hasContent) {
            return undefined;
        }

        return { kind: "folder", uri, label, indexUri };
    }

    private async folderHasVisibleContent(
        uri: vscode.Uri,
        relPath: string,
        indexUri: vscode.Uri | undefined,
    ): Promise<boolean> {
        if (indexUri) {
            return true;
        }

        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(uri);
        } catch {
            return false;
        }

        for (const [name, type] of entries) {
            const childUri = vscode.Uri.joinPath(uri, name);
            const childRel = path.join(relPath, name);
            if (this.shouldSkip(name, childUri)) {
                continue;
            }
            if (type === vscode.FileType.File && name.endsWith(".md")) {
                if (INDEX_NAMES.includes(name)) {
                    continue;
                }
                const title = await this.frontmatter.getTitle(childUri);
                if (title) {
                    return true;
                }
            } else if (type === vscode.FileType.Directory) {
                if (await this.folderHasVisibleContent(childUri, childRel, undefined)) {
                    return true;
                }
            }
        }
        return false;
    }

    private shouldSkip(name: string, absUri: vscode.Uri): boolean {
        if (name.startsWith(".")) {
            return true;
        }
        if (this.ignoreService?.isIgnored(absUri)) {
            return true;
        }
        return false;
    }

    private noNexusNode(): CortexNode {
        return {
            kind: "file",
            uri: vscode.Uri.parse("cortex://no-nexus"),
            label: "No nexus found — click to initialize",
        };
    }
}
