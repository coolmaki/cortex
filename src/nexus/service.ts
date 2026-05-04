import * as vscode from 'vscode';
import { pickActive } from './discovery';

const STATE_KEY = 'cortex.activeNexus';
const CONTEXT_KEY_COUNT = 'cortex.nexusCandidates';

export class NexusService implements vscode.Disposable {
  private candidates: vscode.WorkspaceFolder[] = [];
  private _active: vscode.WorkspaceFolder | undefined;

  private readonly _onDidChangeActive = new vscode.EventEmitter<vscode.WorkspaceFolder | undefined>();
  readonly onDidChangeActive = this._onDidChangeActive.event;

  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  async scan(): Promise<void> {
    this.candidates = await this.findCandidates();
    const prevUri = this.context.workspaceState.get<string>(STATE_KEY);
    await this.applyActive(pickActive(this.candidates, prevUri));
    this.registerWatchers();
    this.registerWorkspaceFolderListener();
  }

  get active(): vscode.WorkspaceFolder | undefined {
    return this._active;
  }

  getCandidates(): vscode.WorkspaceFolder[] {
    return this.candidates;
  }

  async setActive(folder: vscode.WorkspaceFolder): Promise<void> {
    await this.applyActive(folder);
    await this.context.workspaceState.update(STATE_KEY, folder.uri.toString());
  }

  async setActiveByPick(): Promise<void> {
    const items = this.candidates.map((c) => ({
      label: c.name,
      description: c.uri.fsPath,
      detail: c === this._active ? '$(check) Active' : undefined,
      folder: c,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a Cortex nexus to activate',
    });
    if (picked) await this.setActive(picked.folder);
  }

  dispose(): void {
    this._onDidChangeActive.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }

  private async applyActive(folder: vscode.WorkspaceFolder | undefined): Promise<void> {
    this._active = folder;
    await vscode.commands.executeCommand(
      'setContext',
      CONTEXT_KEY_COUNT,
      this.candidates.length,
    );
    this._onDidChangeActive.fire(this._active);
  }

  private async findCandidates(): Promise<vscode.WorkspaceFolder[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const results: vscode.WorkspaceFolder[] = [];
    for (const folder of folders) {
      if (await this.hasCortexDir(folder.uri)) {
        results.push(folder);
      }
    }
    return results;
  }

  private async hasCortexDir(folderUri: vscode.Uri): Promise<boolean> {
    try {
      const cortexUri = vscode.Uri.joinPath(folderUri, '.cortex');
      const stat = await vscode.workspace.fs.stat(cortexUri);
      return stat.type === vscode.FileType.Directory;
    } catch {
      return false;
    }
  }

  private registerWatchers(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      // Watch for .cortex being created or deleted within each workspace folder
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, '.cortex'),
      );
      const rescan = () => this.rescan();
      this.disposables.push(
        watcher,
        watcher.onDidCreate(rescan),
        watcher.onDidDelete(rescan),
      );
    }
  }

  private registerWorkspaceFolderListener(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.rescan()),
    );
  }

  private async rescan(): Promise<void> {
    const prevUri = this._active?.uri.toString();
    this.candidates = await this.findCandidates();
    await this.applyActive(pickActive(this.candidates, prevUri));
    if (this._active) {
      await this.context.workspaceState.update(STATE_KEY, this._active.uri.toString());
    }
  }
}
