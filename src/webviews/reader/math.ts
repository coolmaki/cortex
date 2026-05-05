import type MarkdownIt from "markdown-it";

let initPromise: Promise<void> | null = null;

export function enableMath(md: MarkdownIt): Promise<void> {
    if (initPromise) {
        return initPromise;
    }
    initPromise = (async () => {
        try {
            const [katexModule, katexCore] = await Promise.all([
                import("@vscode/markdown-it-katex"),
                import("katex"),
            ]);
            const katex = katexCore.default;
            // Pass our explicit katex import so the plugin doesn't fall back
            // to a separately-bundled internal copy.
            md.use(katexModule.default as Parameters<MarkdownIt["use"]>[0], { katex });
            try {
                await import("katex/dist/katex.min.css");
            } catch (err) {
                console.warn("[cortex] KaTeX CSS failed to load:", err);
            }
        } catch (err) {
            console.error("[cortex] KaTeX plugin failed to load:", err);
            initPromise = null;
            throw err;
        }
    })();
    return initPromise;
}
