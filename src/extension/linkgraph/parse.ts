import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

export interface ParsedLink {
    kind: "link" | "image";
    href: string;
    line: number;
    lineText: string;
}

const SKIP_HREF = /^#|^https?:\/\/|^mailto:|^tel:/i;

const md = new MarkdownIt({ html: false, linkify: false });

export function parseLinks(source: string): ParsedLink[] {
    const lines = source.split("\n");
    const results: ParsedLink[] = [];

    let tokens: Token[];
    try {
        tokens = md.parse(source, {});
    } catch {
        return [];
    }

    // Table cells emit `inline` tokens with no `map`. Track the most recent
    // sibling-block map[0] (e.g. tr_open) to fall back to.
    let lastBlockLine = 0;
    for (const blockToken of tokens) {
        if (blockToken.map) {
            lastBlockLine = blockToken.map[0];
        }
        if (blockToken.type !== "inline" || !blockToken.children) {
            continue;
        }
        const blockLine = blockToken.map ? blockToken.map[0] : lastBlockLine;

        for (const token of blockToken.children) {
            if (token.type === "link_open") {
                const href = getAttr(token, "href");
                if (href && !SKIP_HREF.test(href)) {
                    const line = blockLine + 1;
                    results.push({
                        kind: "link",
                        href,
                        line,
                        lineText: getLineText(lines, line - 1),
                    });
                }
            } else if (token.type === "image") {
                const src = getAttr(token, "src");
                if (src && !SKIP_HREF.test(src)) {
                    const line = blockLine + 1;
                    results.push({
                        kind: "image",
                        href: src,
                        line,
                        lineText: getLineText(lines, line - 1),
                    });
                }
            }
        }
    }

    return results;
}

function getAttr(token: Token, name: string): string | null {
    if (!token.attrs) {
        return null;
    }
    for (const [k, v] of token.attrs) {
        if (k === name) {
            return v;
        }
    }
    return null;
}

function getLineText(lines: string[], index: number): string {
    const raw = (lines[index] ?? "").trim();
    if (raw.length > 120) {
        return raw.slice(0, 120) + "…";
    }
    return raw;
}
