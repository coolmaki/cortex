import type { HostMessage, ReaderFrontmatter, ThemeKind, WebviewMessage } from "./messaging";
import { renderMarkdown, setTheme, currentGeneration } from "./render";
import { pickMetadata, renderStrip } from "./metadata";
import { renderMermaid } from "./mermaid";
import { HistoryStack } from "./nav";
import { renderToolbar } from "./toolbar";

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState<T>(): T | undefined;
    setState<T>(state: T): T;
};

const vscode = acquireVsCodeApi();

function post(msg: WebviewMessage): void {
    vscode.postMessage(msg);
}

const contentEl = document.getElementById("content") as HTMLElement;
const stripEl = document.getElementById("strip") as HTMLElement;
const toolbarEl = document.getElementById("toolbar") as HTMLElement;

const history = new HistoryStack();
let currentTheme: ThemeKind = "dark";

const toolbar = renderToolbar(post, navigateBack, navigateForward);
toolbarEl.appendChild(toolbar.el);

function updateToolbar(): void {
    toolbar.setNav(history.canGoBack(), history.canGoForward());
}

function navigateBack(): void {
    if (!history.canGoBack()) {
        return;
    }
    history.updateScrollY(window.scrollY);
    history.updateCache(contentEl.innerHTML, stripEl.innerHTML);
    const entry = history.back();
    if (entry) {
        restoreFromHistory(entry);
    }
}

function navigateForward(): void {
    if (!history.canGoForward()) {
        return;
    }
    history.updateScrollY(window.scrollY);
    history.updateCache(contentEl.innerHTML, stripEl.innerHTML);
    const entry = history.forward();
    if (entry) {
        restoreFromHistory(entry);
    }
}

function restoreFromHistory(entry: { fileUri: string; relPath: string; html: string; stripHtml: string; scrollY: number }): void {
    contentEl.innerHTML = entry.html;
    stripEl.innerHTML = entry.stripHtml;
    toolbar.setPath(entry.relPath);
    wireLinks();
    updateToolbar();
    requestAnimationFrame(() => {
        window.scrollTo({ top: entry.scrollY });
    });
    post({ type: "currentDocChanged", fileUri: entry.fileUri });
}

async function renderContent(
    markdown: string,
    frontmatter: ReaderFrontmatter,
    baseUri: string,
    anchor?: string,
): Promise<void> {
    setTheme(currentTheme);

    try {
        const { html, generation } = await renderMarkdown(markdown, baseUri);
        contentEl.innerHTML = html;
        stripEl.innerHTML = renderStrip(pickMetadata(frontmatter));
        wireLinks();
        // Cache the rendered HTML in the current history entry so back/forward
        // can restore it instantly.
        history.updateCache(contentEl.innerHTML, stripEl.innerHTML);

        void renderMermaid(contentEl, currentTheme, generation, currentGeneration).then(() => {
            // Mermaid mutates the DOM after the main render; refresh the cache
            // so back/forward gets the SVG-included version.
            if (currentGeneration() === generation) {
                history.updateCache(contentEl.innerHTML, stripEl.innerHTML);
            }
        });

        if (anchor) {
            requestAnimationFrame(() => {
                const target =
                    document.getElementById(anchor) ??
                    document.querySelector(`[id="${anchor}"]`);
                target?.scrollIntoView();
            });
        }
    } catch (err) {
        console.error("[cortex] Render failed:", err);
        const msg = err instanceof Error ? err.message : String(err);
        contentEl.innerHTML = `<div class="render-error"><strong>Render error:</strong> <code>${escapeHtml(msg)}</code></div>`;
        stripEl.innerHTML = "";
    }
}

function wireLinks(): void {
    contentEl.querySelectorAll<HTMLAnchorElement>("a[data-internal-link]").forEach((a) => {
        a.addEventListener("click", (e) => {
            e.preventDefault();
            const href = a.dataset.internalLink!;
            if (href.startsWith("#")) {
                document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" });
            } else {
                history.updateScrollY(window.scrollY);
                history.updateCache(contentEl.innerHTML, stripEl.innerHTML);
                post({ type: "linkClicked", href });
            }
        });
    });
    contentEl.querySelectorAll<HTMLAnchorElement>("a[href^='http']").forEach((a) => {
        a.addEventListener("click", (e) => {
            e.preventDefault();
            post({ type: "linkClicked", href: a.href });
        });
    });
}

function applyTheme(kind: ThemeKind): void {
    currentTheme = kind;
    setTheme(kind);
    document.body.dataset.theme = kind === "dark" || kind === "high-contrast" ? "dark" : "light";
}

function emptyEntry(fileUri: string, baseUri: string, frontmatter: ReaderFrontmatter, relPath: string) {
    return { fileUri, baseUri, relPath, scrollY: 0, html: "", stripHtml: "", frontmatter };
}

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
    const msg = event.data;

    switch (msg.type) {
        case "init": {
            if (msg.mode === "oversized") {
                applyTheme(msg.themeKind);
                const mb = (msg.sizeBytes / (1024 * 1024)).toFixed(1);
                stripEl.innerHTML = "";
                contentEl.innerHTML = `
                    <div class="oversized-notice">
                        <p>Document is ${mb} MB — showing first 50 KB as plain text.</p>
                        <button id="render-anyway">Render anyway</button>
                        <pre class="oversized-preview">${escapeHtml(msg.preview)}</pre>
                    </div>`;
                document.getElementById("render-anyway")?.addEventListener("click", () => {
                    post({ type: "forceRender" });
                });
            } else {
                applyTheme(msg.themeKind);
                contentEl.innerHTML = "";
                stripEl.innerHTML = "";
                toolbar.setPath(msg.relPath);
                // First init replaces; subsequent inits (e.g. reload of same doc)
                // should also replace, not stack.
                const current = history.current();
                if (current && current.fileUri === msg.fileUri) {
                    history.replaceCurrent(emptyEntry(msg.fileUri, msg.baseUri, msg.frontmatter, msg.relPath));
                } else {
                    history.push(emptyEntry(msg.fileUri, msg.baseUri, msg.frontmatter, msg.relPath));
                }
                updateToolbar();
                void renderContent(msg.content, msg.frontmatter, msg.baseUri, msg.anchor);
            }
            break;
        }
        case "update": {
            const savedScroll = window.scrollY;
            toolbar.setPath(msg.relPath);
            void renderContent(msg.content, msg.frontmatter, msg.baseUri).then(() => {
                window.scrollTo({ top: savedScroll });
            });
            break;
        }
        case "navigateTo": {
            history.push(emptyEntry(msg.fileUri, msg.baseUri, msg.frontmatter, msg.relPath));
            updateToolbar();
            toolbar.setPath(msg.relPath);
            contentEl.innerHTML = "";
            stripEl.innerHTML = "";
            window.scrollTo({ top: 0 });
            void renderContent(msg.content, msg.frontmatter, msg.baseUri, msg.anchor);
            break;
        }
        case "themeChanged": {
            applyTheme(msg.themeKind);
            break;
        }
    }
});

post({ type: "ready" });

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
