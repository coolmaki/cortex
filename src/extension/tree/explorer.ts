import * as vscode from "vscode";
import * as path from "path";
import type { NexusService } from "@/extension/nexus/service";
import { FrontmatterService } from "@/extension/frontmatter/service";
import { IgnoreService } from "@/extension/ignore/service";

const INDEX_NAMES = ["README.md", "INDEX.md", "index.md"];
const DEBOUNCE_MS = 100;

export type CortexNodeKind = "file" | "folder";

export interface CortexNode {
    kind: CortexNodeKind;
    uri: vscode.Uri;
    label: string;
    /** For folders: the URI of the merged index file, if one exists. */
    indexUri?: vscode.Uri;
}

export class CortexExplorerProvider implements vscode.TreeDataProvider<CortexNode> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<
        CortexNode | undefined | null | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly frontmatter: FrontmatterService;
    private ignoreService: IgnoreService | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly nexus: NexusService) {
        this.frontmatter = new FrontmatterService();
        nexus.onDidChangeActive(() => this.onNexusChanged());
        this.onNexusChanged();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(node: CortexNode): vscode.TreeItem {
        const item = new vscode.TreeItem(
            node.label,
            node.kind === "folder"
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        );

        item.resourceUri = node.uri;

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

        const dir = parent?.uri ?? active.uri;
        return this.buildChildren(dir, active.uri, parent?.indexUri);
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
        // Tear down old ignore service + watchers
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

        // Watch .md changes to refresh the tree
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

        // Watch ignore files
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

        const nodes: CortexNode[] = [];

        for (const [name, type] of entries) {
            const uri = vscode.Uri.joinPath(dirUri, name);
            const relPath = path.relative(nexusRoot.fsPath, uri.fsPath);

            if (this.shouldSkip(name, uri)) {
                continue;
            }
            // Skip the index file that was merged into the parent folder node
            if (parentIndexUri && uri.toString() === parentIndexUri.toString()) {
                continue;
            }

            if (type === vscode.FileType.Directory) {
                const folderNode = await this.buildFolderNode(uri, relPath);
                if (folderNode) {
                    nodes.push(folderNode);
                }
            } else if (type === vscode.FileType.File && name.endsWith(".md")) {
                const title = await this.frontmatter.getTitle(uri);
                if (title) {
                    nodes.push({ kind: "file", uri, label: title });
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

    private async buildFolderNode(
        uri: vscode.Uri,
        relPath: string,
    ): Promise<CortexNode | undefined> {
        // Find index file (first match by priority)
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

        // Only include folder if it has the index file, titled .md files, or
        // subdirectories that have content. Peek one level to decide.
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
        } // index file is enough

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
                // Don't re-check index files (they'd be counted again)
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
        // Always skip dotfiles/dotdirs (.cortex, .git, etc.)
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
