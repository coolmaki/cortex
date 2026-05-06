import type { GraphData, GraphEdge, GraphNode } from "./messaging";

export function buildGraph(
    allUris: ReadonlyArray<{ uriString: string; relPath: string }>,
    getTitle: (uriString: string) => string | null | undefined,
    getOutboundUris: (uriString: string) => string[],
): GraphData {
    const titled = new Map<string, { label: string; relPath: string }>();
    for (const { uriString, relPath } of allUris) {
        const title = getTitle(uriString);
        if (title) {
            titled.set(uriString, { label: title, relPath });
        }
    }

    const edges: GraphEdge[] = [];
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();

    for (const sourceUri of titled.keys()) {
        const targets = getOutboundUris(sourceUri);
        const seen = new Set<string>();
        for (const targetUri of targets) {
            if (!titled.has(targetUri) || seen.has(targetUri)) {
                continue;
            }
            seen.add(targetUri);
            edges.push({ sourceUri, targetUri });
            outDegree.set(sourceUri, (outDegree.get(sourceUri) ?? 0) + 1);
            inDegree.set(targetUri, (inDegree.get(targetUri) ?? 0) + 1);
        }
    }

    const nodes: GraphNode[] = Array.from(titled.entries()).map(([uri, { label, relPath }]) => ({
        uri,
        label,
        relPath,
        inDegree: inDegree.get(uri) ?? 0,
        outDegree: outDegree.get(uri) ?? 0,
    }));

    return { nodes, edges };
}
