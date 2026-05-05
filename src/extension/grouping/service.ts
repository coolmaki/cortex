import { resolveGroup } from "./match";
import type { SiblingEntry } from "./match";

export type { SiblingEntry };

export interface GroupingResult {
    logicalChildren: Map<string, string[]>;
    suppressedSiblings: Set<string>;
    primaryParent: Map<string, string>;
}

export class GroupingService {
    resolve(siblings: SiblingEntry[]): GroupingResult {
        const logicalChildren = new Map<string, string[]>();
        const suppressedSiblings = new Set<string>();
        const primaryParent = new Map<string, string>();

        // Collect parent candidates: non-index .md files with a non-empty group array
        const parentCandidates = siblings
            .filter(
                (s) =>
                    !s.isDirectory &&
                    !s.isIndex &&
                    s.basename.endsWith(".md") &&
                    Array.isArray(s.group) &&
                    s.group.length > 0,
            )
            .sort((a, b) => a.uri.localeCompare(b.uri));

        for (const candidate of parentCandidates) {
            const patterns = candidate.group!;
            const matched = resolveGroup({ uri: candidate.uri, patterns }, siblings);

            if (matched.length === 0) {
                continue;
            }

            // Cycle breaking: drop any child that is itself a parent whose matched set
            // already contains this candidate (would create a cycle through first-write-wins)
            const safChildren: string[] = [];
            for (const childUri of matched) {
                if (logicalChildren.has(childUri)) {
                    // child is already a parent; check if it has adopted this candidate
                    const childChildren = logicalChildren.get(childUri)!;
                    if (childChildren.includes(candidate.uri)) {
                        // cycle detected — skip this child under this parent
                        continue;
                    }
                }
                safChildren.push(childUri);
            }

            if (safChildren.length === 0) {
                continue;
            }

            logicalChildren.set(candidate.uri, safChildren);

            for (const childUri of safChildren) {
                suppressedSiblings.add(childUri);
                if (!primaryParent.has(childUri)) {
                    primaryParent.set(childUri, candidate.uri);
                }
            }
        }

        return { logicalChildren, suppressedSiblings, primaryParent };
    }
}
