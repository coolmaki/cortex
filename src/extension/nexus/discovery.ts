import type * as vscode from "vscode";

/**
 * Pure function: from a list of candidates and an optional previously-active URI,
 * returns the best candidate to make active.
 * - If prevUri is still in the candidates list, return it.
 * - Otherwise return the first candidate.
 * - Returns undefined when candidates is empty.
 */
export function pickActive(
    candidates: vscode.WorkspaceFolder[],
    prevUri: string | undefined,
): vscode.WorkspaceFolder | undefined {
    if (candidates.length === 0) {
        return undefined;
    }
    if (prevUri) {
        const match = candidates.find((c) => c.uri.toString() === prevUri);
        if (match) {
            return match;
        }
    }
    return candidates[0];
}
