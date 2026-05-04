import * as vscode from "vscode";
import type { NexusService } from "@/extension/nexus/service";
import type { CortexExplorerProvider, CortexNode } from "@/extension/tree/explorer";
import type { ReaderProvider } from "@/extension/reader/provider";

export function registerCommands(
    context: vscode.ExtensionContext,
    nexus: NexusService,
    explorer: CortexExplorerProvider,
    reader: ReaderProvider,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("cortex.nexus.initialize", () => cmdInitialize(nexus)),
        vscode.commands.registerCommand("cortex.nexus.switch", () => nexus.setActiveByPick()),
        vscode.commands.registerCommand("cortex.nexus.openOrSwitch", () => cmdOpenOrSwitch(nexus)),
        vscode.commands.registerCommand("cortex.tree.refresh", () => explorer.refresh()),
        vscode.commands.registerCommand(
            "cortex.tree.openInReader",
            (nodeOrUri: CortexNode | vscode.Uri) => {
                // Item click passes vscode.Uri (via item.command arguments); context menu passes CortexNode
                const uri =
                    nodeOrUri instanceof vscode.Uri
                        ? nodeOrUri
                        : (nodeOrUri.indexUri ?? nodeOrUri.uri);
                reader.open(uri);
            },
        ),
        vscode.commands.registerCommand(
            "cortex.tree.openSource",
            (node: { uri: vscode.Uri; indexUri?: vscode.Uri }) => {
                const target = node.indexUri ?? node.uri;
                vscode.window.showTextDocument(target);
            },
        ),
    );
}

async function cmdInitialize(nexus: NexusService): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
        vscode.window.showErrorMessage("Cortex: No workspace folder is open.");
        return;
    }

    // Filter out folders that already have .cortex
    const existing = new Set(nexus.getCandidates().map((c) => c.uri.toString()));
    const eligible = folders.filter((f) => !existing.has(f.uri.toString()));

    if (eligible.length === 0) {
        vscode.window.showInformationMessage("All workspace folders already have a Cortex nexus.");
        return;
    }

    let target: vscode.WorkspaceFolder;
    if (eligible.length === 1) {
        target = eligible[0];
    } else {
        const picked = await vscode.window.showQuickPick(
            eligible.map((f) => ({ label: f.name, description: f.uri.fsPath, folder: f })),
            { placeHolder: "Select a folder to initialize as a Cortex nexus" },
        );
        if (!picked) {
            return;
        }
        target = picked.folder;
    }

    const cortexDir = vscode.Uri.joinPath(target.uri, ".cortex");
    await vscode.workspace.fs.createDirectory(cortexDir);
    vscode.window.showInformationMessage(`Cortex nexus initialized in ${target.name}.`);
}

async function cmdOpenOrSwitch(nexus: NexusService): Promise<void> {
    if (nexus.getCandidates().length >= 2) {
        await nexus.setActiveByPick();
    } else {
        vscode.commands.executeCommand("workbench.view.extension.cortex");
    }
}
