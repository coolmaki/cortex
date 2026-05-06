import type { SimEdge, SimNode } from "./simulation";

function getEdgeEndpoints(edge: SimEdge): { src: string; tgt: string } {
    const src = typeof edge.source === "object" ? (edge.source as SimNode).uri : String(edge.source);
    const tgt = typeof edge.target === "object" ? (edge.target as SimNode).uri : String(edge.target);
    return { src, tgt };
}

export function setHover(
    uri: string,
    nodeEls: Map<string, SVGGElement>,
    edgeEls: SVGLineElement[],
    edges: SimEdge[],
): void {
    const neighbors = new Set<string>([uri]);
    for (const edge of edges) {
        const { src, tgt } = getEdgeEndpoints(edge);
        if (src === uri) {
            neighbors.add(tgt);
        }
        if (tgt === uri) {
            neighbors.add(src);
        }
    }

    for (const [nodeUri, el] of nodeEls) {
        const isNeighbor = neighbors.has(nodeUri);
        el.classList.toggle("highlight", isNeighbor);
        el.classList.toggle("dim", !isNeighbor);
    }

    for (const el of edgeEls) {
        const src = el.dataset.sourceUri ?? "";
        const tgt = el.dataset.targetUri ?? "";
        const connected = neighbors.has(src) && neighbors.has(tgt);
        el.classList.toggle("highlight", connected);
        el.classList.toggle("dim", !connected);
    }
}

export function clearHover(nodeEls: Map<string, SVGGElement>, edgeEls: SVGLineElement[]): void {
    for (const el of nodeEls.values()) {
        el.classList.remove("highlight", "dim");
    }
    for (const el of edgeEls) {
        el.classList.remove("highlight", "dim");
    }
}

export function applySearch(
    matchedUris: Set<string>,
    allUris: string[],
    nodeEls: Map<string, SVGGElement>,
    edgeEls: SVGLineElement[],
): void {
    const isAll = matchedUris.size === allUris.length;

    for (const [nodeUri, el] of nodeEls) {
        el.classList.toggle("dim", !isAll && !matchedUris.has(nodeUri));
    }

    for (const el of edgeEls) {
        const src = el.dataset.sourceUri ?? "";
        const tgt = el.dataset.targetUri ?? "";
        const visible = isAll || (matchedUris.has(src) && matchedUris.has(tgt));
        el.classList.toggle("dim", !visible);
    }
}

export function setActiveNode(
    uri: string | undefined,
    nodeEls: Map<string, SVGGElement>,
): void {
    for (const [nodeUri, el] of nodeEls) {
        el.classList.toggle("active", nodeUri === uri);
    }
}
