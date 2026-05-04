import * as vscode from 'vscode';
import * as path from 'path';
import { buildMatcher, isIgnored, type IgnoreMatcher } from './matcher';

export class IgnoreService implements vscode.Disposable {
  private matcher: IgnoreMatcher = buildMatcher('', '');
  private readonly nexusRoot: vscode.Uri;
  private readonly watchers: vscode.Disposable[] = [];

  constructor(nexusRoot: vscode.Uri) {
    this.nexusRoot = nexusRoot;
  }

  async load(): Promise<void> {
    const [gitignore, cortexIgnore] = await Promise.all([
      this.readOptional(vscode.Uri.joinPath(this.nexusRoot, '.gitignore')),
      this.readOptional(vscode.Uri.joinPath(this.nexusRoot, '.cortex', 'ignore')),
    ]);
    this.matcher = buildMatcher(gitignore, cortexIgnore);
  }

  isIgnored(absUri: vscode.Uri): boolean {
    const rootPath = this.nexusRoot.fsPath;
    const relPath = path.relative(rootPath, absUri.fsPath);
    return isIgnored(this.matcher, relPath);
  }

  watchForChanges(onChange: () => void): void {
    const patterns = ['.gitignore', '.cortex/ignore'];
    for (const p of patterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(this.nexusRoot, p),
      );
      const reload = async () => {
        await this.load();
        onChange();
      };
      this.watchers.push(watcher.onDidChange(reload), watcher.onDidCreate(reload), watcher.onDidDelete(reload), watcher);
    }
  }

  dispose(): void {
    for (const w of this.watchers) w.dispose();
    this.watchers.length = 0;
  }

  private async readOptional(uri: vscode.Uri): Promise<string> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString('utf8');
    } catch {
      return '';
    }
  }
}
