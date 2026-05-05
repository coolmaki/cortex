import * as vscode from "vscode";
import { classifyLink } from "./classify";

export type { ClassifiedLink } from "./classify";
export { classifyLink } from "./classify";

export type ResolvedLink =
    | { kind: "external"; url: string }
    | { kind: "internal"; uri: vscode.Uri; anchor?: string }
    | { kind: "anchor"; id: string }
    | { kind: "outside-nexus" };

export function resolveLink(
    href: string,
    currentUri: vscode.Uri,
    nexusRoot: vscode.Uri,
): ResolvedLink {
    const classified = classifyLink(href, currentUri.fsPath, nexusRoot.fsPath);
    if (classified.kind === "internal") {
        return {
            kind: "internal",
            uri: vscode.Uri.file(classified.fsPath),
            anchor: classified.anchor,
        };
    }
    return classified;
}
