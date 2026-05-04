import matter from "gray-matter";

export interface Frontmatter {
    title: string;
    data: Record<string, unknown>;
}

export function parseFrontmatter(content: string): Frontmatter | null {
    let parsed: matter.GrayMatterFile<string>;
    try {
        parsed = matter(content);
    } catch {
        return null;
    }

    const title = parsed.data?.title;
    if (typeof title !== "string" || title.trim() === "") {
        return null;
    }

    return { title: title.trim(), data: parsed.data as Record<string, unknown> };
}
