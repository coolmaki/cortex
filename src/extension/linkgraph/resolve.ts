import * as path from "path";

export function resolveHref(
    href: string,
    sourceFsPath: string,
    nexusFsPath: string,
): string | null {
    if (!href || href.startsWith("#") || /^https?:\/\/|^mailto:|^tel:/i.test(href)) {
        return null;
    }

    const filePart = href.split("#")[0];
    if (!filePart || !filePart.endsWith(".md")) {
        return null;
    }

    const sourceDir = path.dirname(sourceFsPath);
    const resolved = path.resolve(sourceDir, filePart);

    const sep = path.sep;
    const normalizedResolved = resolved.endsWith(sep) ? resolved.slice(0, -1) : resolved;
    const normalizedNexus = nexusFsPath.endsWith(sep) ? nexusFsPath.slice(0, -1) : nexusFsPath;

    if (
        normalizedResolved !== normalizedNexus &&
        !normalizedResolved.startsWith(normalizedNexus + sep)
    ) {
        return null;
    }

    return resolved;
}
