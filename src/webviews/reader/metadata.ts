import type { ReaderFrontmatter } from "./messaging";

export interface PickedMetadata {
    tags: string[];
    type: string | undefined;
    status: string | undefined;
}

export function pickMetadata(frontmatter: ReaderFrontmatter): PickedMetadata {
    return {
        tags: Array.isArray(frontmatter.tags)
            ? (frontmatter.tags as unknown[]).filter((t): t is string => typeof t === "string")
            : [],
        type: typeof frontmatter.type === "string" ? frontmatter.type : undefined,
        status: typeof frontmatter.status === "string" ? frontmatter.status : undefined,
    };
}

export function renderStrip(meta: PickedMetadata): string {
    const hasContent = meta.tags.length > 0 || meta.type !== undefined || meta.status !== undefined;
    if (!hasContent) {
        return "";
    }

    const parts: string[] = [];

    if (meta.type !== undefined) {
        parts.push(`<span class="meta-badge">${escapeHtml(meta.type)}</span>`);
    }
    if (meta.status !== undefined) {
        parts.push(`<span class="meta-badge">${escapeHtml(meta.status)}</span>`);
    }
    for (const tag of meta.tags) {
        parts.push(`<span class="meta-chip">#${escapeHtml(tag)}</span>`);
    }

    return `<div class="meta-strip">${parts.join("")}</div>`;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
