import * as vscode from 'vscode';
import { parseFrontmatter, type Frontmatter } from './parse';

interface CacheEntry {
  mtimeMs: number;
  data: Frontmatter | null;
}

export class FrontmatterService {
  private readonly cache = new Map<string, CacheEntry>();

  async parse(uri: vscode.Uri): Promise<Frontmatter | null> {
    const key = uri.toString();
    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(uri);
    } catch {
      this.cache.delete(key);
      return null;
    }

    const cached = this.cache.get(key);
    if (cached && cached.mtimeMs === stat.mtime) {
      return cached.data;
    }

    let content: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      content = Buffer.from(bytes).toString('utf8');
    } catch {
      return null;
    }

    const data = parseFrontmatter(content);
    this.cache.set(key, { mtimeMs: stat.mtime, data });
    return data;
  }

  async getTitle(uri: vscode.Uri): Promise<string | null> {
    const result = await this.parse(uri);
    return result?.title ?? null;
  }

  invalidate(uri: vscode.Uri): void {
    this.cache.delete(uri.toString());
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
