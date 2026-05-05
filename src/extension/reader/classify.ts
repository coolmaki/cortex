import * as path from "path";

export type ClassifiedLink =
    | { kind: "external"; url: string }
    | { kind: "internal"; fsPath: string; anchor?: string }
    | { kind: "anchor"; id: string }
    | { kind: "outside-nexus" };

/** Pure path-based link classifier — no VS Code APIs. Directly unit-testable. */
export function classifyLink(
    href: string,
    currentFsPath: string,
    nexusFsPath: string,
): ClassifiedLink {
    if (href.startsWith("#")) {
        return { kind: "anchor", id: href.slice(1) };
    }

    if (/^https?:\/\/|^mailto:/i.test(href)) {
        return { kind: "external", url: href };
    }

    const [filePart, anchor] = href.split("#") as [string, string | undefined];
    const currentDir = path.dirname(currentFsPath);
    const resolved = path.resolve(currentDir, filePart);

    const sep = path.sep;
    const normalizedResolved = resolved.endsWith(sep) ? resolved.slice(0, -1) : resolved;
    const normalizedNexus = nexusFsPath.endsWith(sep) ? nexusFsPath.slice(0, -1) : nexusFsPath;

    if (
        normalizedResolved !== normalizedNexus &&
        !normalizedResolved.startsWith(normalizedNexus + sep)
    ) {
        return { kind: "outside-nexus" };
    }

    return { kind: "internal", fsPath: resolved, anchor };
}
