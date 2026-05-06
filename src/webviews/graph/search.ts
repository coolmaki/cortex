import type { GraphNode } from "./messaging";

export function filterNodes(query: string, nodes: ReadonlyArray<GraphNode>): Set<string> {
    if (!query) {
        return new Set(nodes.map((n) => n.uri));
    }
    const lower = query.toLowerCase();
    return new Set(nodes.filter((n) => n.label.toLowerCase().includes(lower)).map((n) => n.uri));
}
