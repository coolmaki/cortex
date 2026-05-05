import type { ThemeKind } from "./messaging";
import type { Highlighter } from "shiki";

let highlighter: Highlighter | null = null;
let initPromise: Promise<void> | null = null;

const LANGS = [
    "typescript",
    "javascript",
    "jsx",
    "tsx",
    "json",
    "bash",
    "sh",
    "python",
    "html",
    "css",
    "markdown",
    "yaml",
    "rust",
    "go",
    "sql",
    "diff",
    "c",
    "cpp",
    "java",
    "ruby",
] as const;

export async function ensureHighlighter(): Promise<void> {
    if (highlighter) {
        return;
    }
    if (initPromise) {
        return initPromise;
    }
    initPromise = (async () => {
        // Use the JavaScript regex engine, not Oniguruma WASM —
        // VS Code webview CSP doesn't allow WebAssembly.
        const [{ createHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([
            import("shiki"),
            import("shiki/engine/javascript"),
        ]);
        highlighter = await createHighlighter({
            themes: ["github-light", "github-dark"],
            langs: [...LANGS],
            engine: createJavaScriptRegexEngine(),
        });
    })();
    return initPromise;
}

export function themeForKind(kind: ThemeKind): "github-light" | "github-dark" {
    return kind === "light" || kind === "high-contrast-light" ? "github-light" : "github-dark";
}

export function highlightSync(code: string, lang: string, themeKind: ThemeKind): string {
    if (!highlighter) {
        return "";
    }
    try {
        const loadedLangs = highlighter.getLoadedLanguages();
        const safeLang = loadedLangs.includes(lang as never) ? lang : "text";
        return highlighter.codeToHtml(code, { lang: safeLang, theme: themeForKind(themeKind) });
    } catch {
        return "";
    }
}
