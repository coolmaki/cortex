import * as vscode from "vscode";
import * as path from "path";
import type { NexusService } from "@/extension/nexus/service";
import type { ReaderProvider } from "@/extension/reader/provider";

export class ActiveFileTracker implements vscode.Disposable {
    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri | undefined>();
    readonly onDidChange = this._onDidChange.event;

    private readerUri: vscode.Uri | undefined;
    private editorUri: vscode.Uri | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly reader: ReaderProvider,
        private readonly nexus: NexusService,
    ) {
        this.disposables.push(
            reader.onDidChangeCurrentDoc((uri) => {
                this.readerUri = uri;
                this.fire();
            }),
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                const uri = editor?.document.uri;
                if (uri?.fsPath.endsWith(".md")) {
                    this.editorUri = uri;
                } else {
                    this.editorUri = undefined;
                }
                this.fire();
            }),
        );
    }

    current(): vscode.Uri | undefined {
        const active = this.nexus.active;
        if (!active) {
            return undefined;
        }
        const nexusPath = active.uri.fsPath;

        if (this.readerUri && this.isInsideNexus(this.readerUri, nexusPath)) {
            return this.readerUri;
        }
        if (this.editorUri && this.isInsideNexus(this.editorUri, nexusPath)) {
            return this.editorUri;
        }
        return undefined;
    }

    dispose(): void {
        this._onDidChange.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    private fire(): void {
        this._onDidChange.fire(this.current());
    }

    private isInsideNexus(uri: vscode.Uri, nexusPath: string): boolean {
        const sep = path.sep;
        const normalizedNexus = nexusPath.endsWith(sep) ? nexusPath.slice(0, -1) : nexusPath;
        return (
            uri.fsPath === normalizedNexus || uri.fsPath.startsWith(normalizedNexus + sep)
        );
    }
}
