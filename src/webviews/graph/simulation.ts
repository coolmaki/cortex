import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCenter,
    forceCollide,
} from "d3-force";
import type { Simulation, SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import type { GraphNode, GraphEdge } from "./messaging";

export interface SimNode extends SimulationNodeDatum {
    uri: string;
    label: string;
    relPath: string;
    inDegree: number;
    outDegree: number;
}

export interface SimEdge extends SimulationLinkDatum<SimNode> {
    sourceUri: string;
    targetUri: string;
}

export function nodeRadius(node: SimNode): number {
    return 4 + Math.sqrt(node.inDegree + node.outDegree) * 2;
}

export function toSimNodes(
    newNodes: GraphNode[],
    existing: Map<string, SimNode>,
    cx: number,
    cy: number,
): SimNode[] {
    const jitter = 20;
    return newNodes.map((n) => {
        const prev = existing.get(n.uri);
        return {
            ...n,
            x: prev?.x ?? cx + (Math.random() - 0.5) * jitter,
            y: prev?.y ?? cy + (Math.random() - 0.5) * jitter,
            vx: prev?.vx ?? 0,
            vy: prev?.vy ?? 0,
        };
    });
}

export function toSimEdges(edges: GraphEdge[]): SimEdge[] {
    return edges.map((e) => ({
        source: e.sourceUri,
        target: e.targetUri,
        sourceUri: e.sourceUri,
        targetUri: e.targetUri,
    }));
}

export class GraphSimulation {
    private sim: Simulation<SimNode, SimEdge>;
    private onTickCb: (() => void) | undefined;

    constructor(width: number, height: number) {
        this.sim = forceSimulation<SimNode, SimEdge>()
            .force(
                "link",
                forceLink<SimNode, SimEdge>([])
                    .id((d) => d.uri)
                    .distance(80),
            )
            .force("charge", forceManyBody<SimNode>().strength(-180))
            .force("center", forceCenter(width / 2, height / 2))
            .force("collide", forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4))
            .on("tick", () => this.onTickCb?.());
    }

    onTick(cb: () => void): void {
        this.onTickCb = cb;
    }

    setData(nodes: SimNode[], edges: SimEdge[]): void {
        this.sim.nodes(nodes);
        const lf = this.sim.force<ReturnType<typeof forceLink<SimNode, SimEdge>>>("link");
        lf?.links(edges);
    }

    restart(alpha = 1): void {
        this.sim.alpha(alpha).restart();
    }

    nudge(): void {
        this.sim.alpha(0.5).restart();
    }

    stop(): void {
        this.sim.stop();
    }

    nodes(): SimNode[] {
        return this.sim.nodes();
    }

    updateCenter(width: number, height: number): void {
        const cf = this.sim.force<ReturnType<typeof forceCenter>>("center");
        cf?.x(width / 2).y(height / 2);
    }
}
