import type { ReaderFrontmatter } from "./messaging";

export interface HistoryEntry {
    fileUri: string;
    baseUri: string;
    relPath: string;
    scrollY: number;
    /** Cached rendered HTML — populated after first render of this entry. */
    html: string;
    /** Cached metadata strip HTML. */
    stripHtml: string;
    frontmatter: ReaderFrontmatter;
}

export class HistoryStack {
    private stack: HistoryEntry[] = [];
    private cursor = -1;

    push(entry: HistoryEntry): void {
        this.stack = this.stack.slice(0, this.cursor + 1);
        this.stack.push(entry);
        this.cursor = this.stack.length - 1;
    }

    /** Replace the current entry — used when initial doc loads, to avoid duplicating. */
    replaceCurrent(entry: HistoryEntry): void {
        if (this.cursor >= 0) {
            this.stack[this.cursor] = entry;
        } else {
            this.push(entry);
        }
    }

    updateScrollY(scrollY: number): void {
        if (this.cursor >= 0) {
            this.stack[this.cursor].scrollY = scrollY;
        }
    }

    updateCache(html: string, stripHtml: string): void {
        if (this.cursor >= 0) {
            this.stack[this.cursor].html = html;
            this.stack[this.cursor].stripHtml = stripHtml;
        }
    }

    back(): HistoryEntry | undefined {
        if (this.cursor <= 0) {
            return undefined;
        }
        this.cursor--;
        return this.stack[this.cursor];
    }

    forward(): HistoryEntry | undefined {
        if (this.cursor >= this.stack.length - 1) {
            return undefined;
        }
        this.cursor++;
        return this.stack[this.cursor];
    }

    current(): HistoryEntry | undefined {
        return this.stack[this.cursor];
    }

    canGoBack(): boolean {
        return this.cursor > 0;
    }

    canGoForward(): boolean {
        return this.cursor < this.stack.length - 1;
    }
}
