import ignore from "ignore";

export interface GroupCandidate {
    uri: string;
    patterns: string[];
}

export interface SiblingEntry {
    uri: string;
    basename: string;
    isDirectory: boolean;
    isIndex: boolean;
    group?: string[];
}

export function resolveGroup(parent: GroupCandidate, siblings: SiblingEntry[]): string[] {
    if (parent.patterns.length === 0) {
        return [];
    }

    const ig = ignore();
    for (const pattern of parent.patterns) {
        try {
            ig.add(pattern);
        } catch (err) {
            console.warn(`cortex: invalid group pattern "${pattern}":`, err);
        }
    }

    const matched: SiblingEntry[] = [];
    for (const sibling of siblings) {
        if (sibling.uri === parent.uri) {
            continue;
        }
        if (sibling.isIndex) {
            continue;
        }
        const testName = sibling.isDirectory ? sibling.basename + "/" : sibling.basename;
        let isMatch = false;
        try {
            isMatch = ig.ignores(testName);
        } catch {
            continue;
        }
        if (isMatch) {
            matched.push(sibling);
        }
    }

    matched.sort((a, b) => a.basename.localeCompare(b.basename));
    return matched.map((s) => s.uri);
}
