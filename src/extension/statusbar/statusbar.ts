import * as vscode from "vscode";
import type { NexusService } from "@/extension/nexus/service";

export function createStatusBar(nexus: NexusService): vscode.Disposable {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    item.command = "cortex.nexus.openOrSwitch";

    const update = (active: vscode.WorkspaceFolder | undefined) => {
        const count = nexus.getCandidates().length;
        if (active) {
            item.text = `$(book) Cortex: ${active.name}`;
            item.tooltip =
                count >= 2 ? `Switch active nexus (${count} available)` : "Open Cortex View";
        } else {
            item.text = "$(book) Cortex: no nexus";
            item.tooltip = "No Cortex nexus found in this workspace";
        }
        item.show();
    };

    update(nexus.active);
    const sub = nexus.onDidChangeActive(update);

    return {
        dispose: () => {
            sub.dispose();
            item.dispose();
        },
    };
}
