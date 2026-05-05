import MarkdownIt from "markdown-it";
import type MarkdownItType from "markdown-it";
import type { ThemeKind } from "./messaging";
import { ensureHighlighter, highlightSync } from "./highlight";
import { enableMath } from "./math";

// @ts-expect-error — no types
import taskLists from "markdown-it-task-lists";
// @ts-expect-error — no types
import footnote from "markdown-it-footnote";
// @ts-expect-error — no types
import { full as markdownItEmoji } from "markdown-it-emoji";
import alerts from "markdown-it-github-alerts";

let md: MarkdownItType | null = null;
let currentTheme: ThemeKind = "dark";
let renderGeneration = 0;

function buildMd(): MarkdownItType {
    const instance = new MarkdownIt({
        html: false,
        linkify: true,
        breaks: false,
        typographer: false,
        highlight: (code, lang) => highlightSync(code, lang.trim().toLowerCase(), currentTheme),
    });

    instance.use(taskLists, { enabled: true, label: true });
    instance.use(footnote);
    instance.use(markdownItEmoji);
    instance.use(alerts);

    // GitHub-style heading IDs so in-doc anchor links resolve.
    instance.core.ruler.push("heading_ids", (state) => {
        const seen = new Map<string, number>();
        const tokens = state.tokens;
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].type !== "heading_open") {
                continue;
            }
            const inline = tokens[i + 1];
            if (!inline || inline.type !== "inline") {
                continue;
            }
            const base = githubSlug(inline.content);
            if (!base) {
                continue;
            }
            const count = seen.get(base) ?? 0;
            const slug = count === 0 ? base : `${base}-${count}`;
            seen.set(base, count + 1);
            tokens[i].attrSet("id", slug);
        }
    });

    // Mermaid: emit <pre class="mermaid"> with the source as text content.
    // mermaid.run() reads textContent and replaces it with rendered SVG.
    const defaultFence = instance.renderer.rules.fence!;
    instance.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const lang = (token.info ?? "").trim().toLowerCase();
        if (lang === "mermaid") {
            return `<pre class="mermaid">${escapeHtml(token.content)}</pre>`;
        }
        return defaultFence(tokens, idx, options, env, self);
    };

    return instance;
}

function getMd(): MarkdownItType {
    if (!md) {
        md = buildMd();
    }
    return md;
}

export function setTheme(kind: ThemeKind): void {
    currentTheme = kind;
}

export async function renderMarkdown(
    source: string,
    baseUri: string,
): Promise<{ html: string; generation: number }> {
    const gen = ++renderGeneration;

    try {
        await ensureHighlighter();
    } catch (err) {
        console.error("[cortex] Shiki failed to initialize:", err);
    }

    if (source.includes("$")) {
        try {
            await enableMath(getMd());
        } catch {
            // enableMath logs its own error.
        }
    }

    const instance = getMd();

    const savedImage = instance.renderer.rules.image;
    const savedLinkOpen = instance.renderer.rules.link_open;

    instance.renderer.rules.image = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const srcIdx = token.attrIndex("src");
        if (srcIdx >= 0 && token.attrs) {
            const src = token.attrs[srcIdx][1];
            if (src && !/^https?:\/\/|^data:|^blob:/i.test(src)) {
                const rel = src.replace(/^\.\//, "");
                const slash = baseUri.endsWith("/") ? "" : "/";
                token.attrs[srcIdx][1] = `${baseUri}${slash}${rel}`;
            }
        }
        return savedImage
            ? savedImage(tokens, idx, options, env, self)
            : self.renderToken(tokens, idx, options);
    };

    instance.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const hrefIdx = token.attrIndex("href");
        const href = hrefIdx >= 0 && token.attrs ? token.attrs[hrefIdx][1] : "";
        if (href && !/^https?:\/\/|^mailto:/i.test(href)) {
            // Tag for our click handler; leave the href intact so middle-click
            // and preventDefault both behave sensibly.
            token.attrSet("data-internal-link", href);
        }
        return savedLinkOpen
            ? savedLinkOpen(tokens, idx, options, env, self)
            : self.renderToken(tokens, idx, options);
    };

    const html = instance.render(source);

    instance.renderer.rules.image = savedImage;
    instance.renderer.rules.link_open = savedLinkOpen;

    return { html, generation: gen };
}

export function currentGeneration(): number {
    return renderGeneration;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Mirrors GitHub's heading-anchor slug: lowercase, strip punctuation,
// collapse whitespace to hyphens. Keeps unicode letters/numbers.
function githubSlug(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/<[^>]+>/g, "")
        .replace(/[`~!@#$%^&*()+=<>?,./:;"'|{}\[\]\\]/g, "")
        .replace(/\s+/g, "-");
}
