import type { ThemeKind } from "./messaging";

let initialized = false;
let lastTheme: ThemeKind | null = null;
let idCounter = 0;

export async function renderMermaid(
    contentEl: HTMLElement,
    themeKind: ThemeKind,
    generation: number,
    getGeneration: () => number,
): Promise<void> {
    const blocks = Array.from(
        contentEl.querySelectorAll<HTMLElement>("pre.mermaid:not([data-processed])"),
    );
    if (blocks.length === 0) {
        return;
    }

    let mermaid;
    try {
        mermaid = (await import("mermaid")).default;
    } catch (err) {
        console.error("[cortex] Failed to load mermaid:", err);
        return;
    }

    if (getGeneration() !== generation) {
        return;
    }

    const isDark = themeKind === "dark" || themeKind === "high-contrast";
    if (!initialized || lastTheme !== themeKind) {
        mermaid.initialize({
            startOnLoad: false,
            theme: isDark ? "dark" : "default",
            securityLevel: "loose",
            // Throw on parse errors instead of injecting mermaid's "Syntax
            // error in text" SVG into the document body.
            suppressErrorRendering: true,
        });
        initialized = true;
        lastTheme = themeKind;
    }

    for (const block of blocks) {
        if (getGeneration() !== generation) {
            return;
        }

        const source = (block.textContent ?? "").replace(/^\s*\n+|\n+\s*$/g, "");

        if (!source) {
            block.setAttribute("data-processed", "true");
            continue;
        }

        const id = `cortex-mermaid-${++idCounter}`;
        try {
            // Validate first: parse() throws on syntax errors without touching
            // the DOM, so we never even call render() for bad input.
            await mermaid.parse(source);
            const { svg, bindFunctions } = await mermaid.render(id, source);
            if (getGeneration() !== generation) {
                return;
            }
            block.innerHTML = svg;
            block.setAttribute("data-processed", "true");
            if (bindFunctions) {
                bindFunctions(block);
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            block.innerHTML = `<div class="mermaid-error"><strong>Mermaid error:</strong> ${escapeHtml(errMsg)}</div><pre><code>${escapeHtml(source)}</code></pre>`;
            block.setAttribute("data-processed", "true");
        }

        // Defensive cleanup: mermaid creates temporary DOM elements for
        // measurement at the body level; if render threw, the element may
        // linger. Restrict the search to direct body children so we don't
        // accidentally remove the SVG we just placed inside `block` (mermaid
        // uses our `id` as the SVG element's id too).
        for (const child of Array.from(document.body.children)) {
            if (child.id === id) {
                child.remove();
                break;
            }
        }
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
