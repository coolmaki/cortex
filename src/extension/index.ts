import * as vscode from "vscode";
import { NexusService } from "@/extension/nexus/service";
import { FrontmatterService } from "@/extension/frontmatter/service";
import { IgnoreService } from "@/extension/ignore/service";
import { CortexExplorerProvider } from "@/extension/tree/explorer";
import { ReaderProvider } from "@/extension/reader/provider";
import { GraphProvider } from "@/extension/graph/provider";
import { createStatusBar } from "@/extension/statusbar/statusbar";
import { registerCommands } from "@/extension/commands/index";
import { LinkGraphService } from "@/extension/linkgraph/service";
import { ActiveFileTracker } from "@/extension/backlinks/activeFile";
import { BacklinksProvider } from "@/extension/backlinks/provider";
import type { LinkGraphLike } from "@/extension/backlinks/provider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const nexus = new NexusService(context);
    await nexus.scan();
    context.subscriptions.push(nexus);

    const frontmatter = new FrontmatterService();
    const reader = new ReaderProvider(context.extensionUri, frontmatter, nexus);
    context.subscriptions.push(reader);

    const explorerProvider = new CortexExplorerProvider(nexus);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("cortex.explorer", explorerProvider),
    );

    // Stable event emitter that forwards from the current linkGraph
    const linkGraphUpdateEmitter = new vscode.EventEmitter<vscode.Uri[]>();
    context.subscriptions.push(linkGraphUpdateEmitter);

    let ignoreService: IgnoreService | undefined;
    let linkGraph: LinkGraphService | undefined;
    let linkGraphUpdateSub: vscode.Disposable | undefined;

    const startLinkGraph = async (nexusRoot: vscode.Uri) => {
        linkGraphUpdateSub?.dispose();
        ignoreService?.dispose();
        linkGraph?.dispose();

        ignoreService = new IgnoreService(nexusRoot);
        await ignoreService.load();

        linkGraph = new LinkGraphService(frontmatter, ignoreService);
        linkGraphUpdateSub = linkGraph.onDidUpdate((uris) => linkGraphUpdateEmitter.fire(uris));
        await linkGraph.start(nexusRoot);
    };

    if (nexus.active) {
        await startLinkGraph(nexus.active.uri);
    }

    nexus.onDidChangeActive(async (active) => {
        if (active) {
            await startLinkGraph(active.uri);
        } else {
            linkGraphUpdateSub?.dispose();
            ignoreService?.dispose();
            linkGraph?.dispose();
            linkGraphUpdateSub = undefined;
            ignoreService = undefined;
            linkGraph = undefined;
        }
    });

    // Backlinks
    const activeFile = new ActiveFileTracker(reader, nexus);
    context.subscriptions.push(activeFile);

    // Create a stable LinkGraphService proxy that delegates to the current instance
    const linkGraphProxy = new LinkGraphServiceProxy(
        () => linkGraph,
        linkGraphUpdateEmitter.event,
    );
    context.subscriptions.push(linkGraphProxy);

    const backlinksProvider = new BacklinksProvider(linkGraphProxy, frontmatter, activeFile);
    context.subscriptions.push(backlinksProvider);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("cortex.backlinks", backlinksProvider),
    );

    const graphProvider = new GraphProvider(
        context.extensionUri,
        nexus,
        linkGraphProxy,
        frontmatter,
        activeFile,
    );
    context.subscriptions.push(graphProvider);

    // Dispose the graph panel when the active nexus changes (graph is per-nexus)
    nexus.onDidChangeActive(() => {
        graphProvider.disposePanel();
    });

    context.subscriptions.push(createStatusBar(nexus));
    registerCommands(context, nexus, explorerProvider, reader, graphProvider, linkGraphProxy);
}

export function deactivate(): void {}

class LinkGraphServiceProxy implements LinkGraphLike, vscode.Disposable {
    readonly onDidUpdate: vscode.Event<vscode.Uri[]>;

    constructor(
        private readonly getCurrent: () => LinkGraphService | undefined,
        onDidUpdate: vscode.Event<vscode.Uri[]>,
    ) {
        this.onDidUpdate = onDidUpdate;
    }

    getInbound(uri: vscode.Uri) {
        return this.getCurrent()?.getInbound(uri) ?? [];
    }

    getOutbound(uri: vscode.Uri) {
        return this.getCurrent()?.getOutbound(uri) ?? [];
    }

    getAllTrackedUris() {
        return this.getCurrent()?.getAllTrackedUris() ?? [];
    }

    dispose(): void {}
}
