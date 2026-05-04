import ignore from "ignore";

export type IgnoreMatcher = ReturnType<typeof ignore>;

export function buildMatcher(gitignoreContent: string, cortexIgnoreContent: string): IgnoreMatcher {
    const ig = ignore();
    if (gitignoreContent.trim()) {
        ig.add(gitignoreContent);
    }
    if (cortexIgnoreContent.trim()) {
        ig.add(cortexIgnoreContent);
    }
    return ig;
}

export function isIgnored(matcher: IgnoreMatcher, relPath: string): boolean {
    if (!relPath) {
        return false;
    }
    // ignore package expects forward slashes, no leading/trailing slash
    const normalized = relPath.replace(/\\/g, "/").replace(/^\//, "").replace(/\/$/, "");
    if (!normalized) {
        return false;
    }
    try {
        // Try both `path` and `path/` so that directory-specific patterns (e.g. `src/`)
        // match when the caller passes just the directory name without a trailing slash.
        return matcher.ignores(normalized) || matcher.ignores(normalized + "/");
    } catch {
        return false;
    }
}
