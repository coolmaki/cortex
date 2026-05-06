import { select } from "d3-selection";
import type { Selection } from "d3-selection";
import type { SimNode, SimEdge } from "./simulation";
import { nodeRadius } from "./simulation";

export type NodeSel = Selection<SVGGElement, SimNode, SVGGElement, unknown>;
export type EdgeSel = Selection<SVGLineElement, SimEdge, SVGGElement, unknown>;

let nodesGroup: SVGGElement;
let edgesGroup: SVGGElement;

export function initSvg(container: HTMLElement): {
    svg: SVGSVGElement;
    viewport: SVGGElement;
} {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "graph-svg";

    // no defs needed — undirected, no arrowheads

    const viewport = document.createElementNS("http://www.w3.org/2000/svg", "g");
    viewport.classList.add("viewport");
    svg.appendChild(viewport);

    const eg = document.createElementNS("http://www.w3.org/2000/svg", "g");
    eg.classList.add("edges");
    viewport.appendChild(eg);
    edgesGroup = eg;

    const ng = document.createElementNS("http://www.w3.org/2000/svg", "g");
    ng.classList.add("nodes");
    viewport.appendChild(ng);
    nodesGroup = ng;

    container.appendChild(svg);
    return { svg, viewport };
}

export function bindData(nodes: SimNode[], edges: SimEdge[]): { nodeSel: NodeSel; edgeSel: EdgeSel } {
    const edgeSel = select<SVGGElement, unknown>(edgesGroup)
        .selectAll<SVGLineElement, SimEdge>("line.edge")
        .data(edges, (d) => `${d.sourceUri}→${d.targetUri}`);

    edgeSel.exit().remove();

    const edgeEnter = edgeSel.enter().append("line").attr("class", "edge");

    const mergedEdges = edgeEnter.merge(edgeSel);

    const nodeSel = select<SVGGElement, unknown>(nodesGroup)
        .selectAll<SVGGElement, SimNode>("g.node")
        .data(nodes, (d) => d.uri);

    nodeSel.exit().remove();

    const nodeEnter = nodeSel.enter().append("g").attr("class", "node").attr("tabindex", "0");
    nodeEnter.append("circle");
    nodeEnter.append("text").attr("dy", "0.35em").attr("x", (d) => nodeRadius(d) + 4);

    const mergedNodes = nodeEnter.merge(nodeSel);

    mergedNodes.select<SVGCircleElement>("circle").attr("r", (d) => nodeRadius(d));
    mergedNodes.select<SVGTextElement>("text").text((d) => d.label);
    mergedNodes.attr("title", (d) => d.relPath);

    return { nodeSel: mergedNodes, edgeSel: mergedEdges };
}

export function applyTick(nodeSel: NodeSel, edgeSel: EdgeSel): void {
    nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);

    edgeSel.each(function (d) {
        const src = d.source as SimNode;
        const tgt = d.target as SimNode;
        if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) {
            return;
        }
        select(this)
            .attr("x1", src.x)
            .attr("y1", src.y)
            .attr("x2", tgt.x)
            .attr("y2", tgt.y);
    });
}
