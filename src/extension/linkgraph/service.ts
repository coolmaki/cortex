import * as vscode from "vscode";
import * as path from "path";
import type { FrontmatterService } from "@/extension/frontmatter/service";
import type { IgnoreService } from "@/extension/ignore/service";
import { parseLinks } from "./parse";
import type { ParsedLink } from "./parse";
import { resolveHref } from "./resolve";
import { deserializeCache, serializeCache, pruneCache } from "./cache";
import type { CacheEntry } from "./cache";

const DEBOUNCE_MS = 500;

interface GraphEntry {
    outbound: ParsedLink[];
    mtime: number;
}

interface InboundEdge {
    source: vscode.Uri;
    link: ParsedLink;
}

export class LinkGraphService implements vscode.Disposable {
    private readonly _onDidUpdate = new vscode.EventEmitter<vscode.Uri[]>();
    readonly onDidUpdate = this._onDidUpdate.event;

    private readonly graph = new Map<string, GraphEntry>();
    private nexusRoot: vscode.Uri | undefined;
    private cacheUri: vscode.Uri | undefined;
    private writeTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly frontmatter: FrontmatterService,
        private readonly ignoreService: IgnoreService,
    ) {}

    async start(nexusRoot: vscode.Uri): Promise<void> {
        this.nexusRoot = nexusRoot;
        this.cacheUri = vscode.Uri.joinPath(nexusRoot, ".cortex", "cache", "linkgraph.json");

        // Load cache
        const cached = await this.loadCache();

        // Walk all .md files
        const allRelPaths = await this.walkMdFiles(nexusRoot);
        const existingKeys = new Set(allRelPaths);

        // Prune missing files from cache
        const prunedCache = pruneCache(cached, existingKeys);

        // Parse/hydrate all files
        const changed: string[] = [];
        for (const relPath of allRelPaths) {
            const fsPath = path.join(nexusRoot.fsPath, relPath);
            const uri = vscode.Uri.file(fsPath);
            let stat: vscode.FileStat;
            try {
                stat = await vscode.workspace.fs.stat(uri);
            } catch {
                continue;
            }

            const cachedEntry = prunedCache.get(relPath);
            if (cachedEntry && cachedEntry.mtime === stat.mtime) {
                this.graph.set(relPath, { outbound: cachedEntry.outbound, mtime: stat.mtime });
            } else {
                const outbound = await this.parseFile(uri);
                this.graph.set(relPath, { outbound, mtime: stat.mtime });
                changed.push(relPath);
            }
        }

        if (changed.length > 0) {
            this.scheduleWrite();
        }

        this.registerWatchers();
    }

    getInbound(uri: vscode.Uri): InboundEdge[] {
        if (!this.nexusRoot) {
            return [];
        }
        const targetFsPath = uri.fsPath;
        const result: InboundEdge[] = [];

        for (const [relPath, entry] of this.graph) {
            const sourceFsPath = path.join(this.nexusRoot.fsPath, relPath);
            const sourceUri = vscode.Uri.file(sourceFsPath);

            for (const link of entry.outbound) {
                const resolved = resolveHref(link.href, sourceFsPath, this.nexusRoot.fsPath);
                if (resolved === targetFsPath) {
                    result.push({ source: sourceUri, link });
                }
            }
        }

        // Filter to titled sources
        return result.filter(({ source }) => {
            // Synchronous check: use cache if available
            return this.hasTitleSync(source);
        });
    }

    getOutbound(uri: vscode.Uri): ParsedLink[] {
        if (!this.nexusRoot) {
            return [];
        }
        const relPath = this.toRelPath(uri);
        return this.graph.get(relPath)?.outbound ?? [];
    }

    getAllTrackedUris(): vscode.Uri[] {
        if (!this.nexusRoot) {
            return [];
        }
        return Array.from(this.graph.keys()).map((relPath) => {
            const fsPath = path.join(this.nexusRoot!.fsPath, relPath);
            return vscode.Uri.file(fsPath);
        });
    }

    dispose(): void {
        this.flushWrite();
        this._onDidUpdate.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    // ── private ───────────────────────────────────────────────────────────────

    private hasTitleSync(uri: vscode.Uri): boolean {
        // FrontmatterService caches by mtime; we call the async version but
        // for synchronous filtering we fall back to always-include when uncached.
        // The async version is called at start-time so most will be cached.
        // For correctness in the sync path, use the internal cache state.
        // Since FrontmatterService doesn't expose sync access, we assume titled
        // if it's a .md file (BacklinksProvider can do async filtering separately).
        return uri.fsPath.endsWith(".md");
    }

    private async updateFile(uri: vscode.Uri): Promise<void> {
        if (!this.nexusRoot) {
            return;
        }
        const relPath = this.toRelPath(uri);
        if (!relPath) {
            return;
        }

        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch {
            // File deleted
            this.graph.delete(relPath);
            this.scheduleWrite();
            this._onDidUpdate.fire([uri]);
            return;
        }

        const outbound = await this.parseFile(uri);
        this.graph.set(relPath, { outbound, mtime: stat.mtime });
        this.scheduleWrite();
        this._onDidUpdate.fire([uri]);
    }

    private async parseFile(uri: vscode.Uri): Promise<ParsedLink[]> {
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const source = Buffer.from(bytes).toString("utf8");
            return parseLinks(source);
        } catch {
            return [];
        }
    }

    private async loadCache(): Promise<Map<string, CacheEntry>> {
        if (!this.cacheUri) {
            return new Map();
        }
        try {
            const bytes = await vscode.workspace.fs.readFile(this.cacheUri);
            return deserializeCache(Buffer.from(bytes).toString("utf8"));
        } catch {
            return new Map();
        }
    }

    private scheduleWrite(): void {
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
        }
        this.writeTimer = setTimeout(() => {
            this.flushWrite();
            this.writeTimer = undefined;
        }, DEBOUNCE_MS);
    }

    private flushWrite(): void {
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
            this.writeTimer = undefined;
        }
        if (!this.cacheUri) {
            return;
        }
        const entries = new Map<string, CacheEntry>();
        for (const [relPath, entry] of this.graph) {
            entries.set(relPath, { mtime: entry.mtime, outbound: entry.outbound });
        }
        const json = serializeCache(entries);
        const cacheUri = this.cacheUri;
        // Write asynchronously but don't await — dispose can't be async
        vscode.workspace.fs
            .createDirectory(vscode.Uri.joinPath(cacheUri, ".."))
            .then(() => vscode.workspace.fs.writeFile(cacheUri, Buffer.from(json, "utf8")))
            .then(undefined, (err: unknown) => {
                console.warn("cortex: failed to write link graph cache:", err);
            });
    }

    private registerWatchers(): void {
        if (!this.nexusRoot) {
            return;
        }

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.nexusRoot, "**/*.md"),
        );

        let debounceTimer: ReturnType<typeof setTimeout> | undefined;
        const pendingUris = new Set<string>();

        const scheduleUpdate = (uri: vscode.Uri) => {
            pendingUris.add(uri.toString());
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
                const uris = Array.from(pendingUris).map((s) => vscode.Uri.parse(s));
                pendingUris.clear();
                debounceTimer = undefined;
                for (const u of uris) {
                    void this.updateFile(u);
                }
            }, 150);
        };

        this.disposables.push(
            watcher,
            watcher.onDidCreate(scheduleUpdate),
            watcher.onDidDelete(scheduleUpdate),
            watcher.onDidChange(scheduleUpdate),
            vscode.workspace.onDidSaveTextDocument((doc) => {
                if (doc.uri.fsPath.endsWith(".md")) {
                    scheduleUpdate(doc.uri);
                }
            }),
        );
    }

    private async walkMdFiles(root: vscode.Uri): Promise<string[]> {
        const results: string[] = [];
        await this.walkDir(root, root, results);
        return results;
    }

    private async walkDir(
        root: vscode.Uri,
        dir: vscode.Uri,
        results: string[],
    ): Promise<void> {
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(dir);
        } catch {
            return;
        }

        for (const [name, type] of entries) {
            const uri = vscode.Uri.joinPath(dir, name);
            if (name.startsWith(".")) {
                continue;
            }
            if (this.ignoreService.isIgnored(uri)) {
                continue;
            }
            if (type === vscode.FileType.Directory) {
                await this.walkDir(root, uri, results);
            } else if (type === vscode.FileType.File && name.endsWith(".md")) {
                results.push(this.toRelPath(uri));
            }
        }
    }

    private toRelPath(uri: vscode.Uri): string {
        if (!this.nexusRoot) {
            return "";
        }
        return path.relative(this.nexusRoot.fsPath, uri.fsPath).replace(/\\/g, "/");
    }
}
