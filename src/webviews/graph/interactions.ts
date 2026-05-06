import { zoom } from "d3-zoom";
import { drag } from "d3-drag";
import type { D3DragEvent } from "d3-drag";
import { select } from "d3-selection";
import type { GraphSimulation, SimNode } from "./simulation";
import type { NodeSel } from "./render";

export function applyZoom(svg: SVGSVGElement, viewport: SVGGElement): void {
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 8])
        .on("zoom", (event) => {
            select(viewport).attr("transform", event.transform.toString());
        });

    select(svg).call(zoomBehavior);

    // Prevent node clicks from triggering zoom
    select(svg).on("dblclick.zoom", null);
}

export function applyDrag(nodeSel: NodeSel, simulation: GraphSimulation): void {
    const dragBehavior = drag<SVGGElement, SimNode>()
        .on("start", (event: D3DragEvent<SVGGElement, SimNode, SimNode>, d) => {
            if (!event.active) {
                simulation.nudge();
            }
            d.fx = d.x;
            d.fy = d.y;
        })
        .on("drag", (event: D3DragEvent<SVGGElement, SimNode, SimNode>, d) => {
            d.fx = event.x;
            d.fy = event.y;
        })
        .on("end", (event: D3DragEvent<SVGGElement, SimNode, SimNode>, d) => {
            if (!event.active) {
                simulation.nudge();
            }
            d.fx = null;
            d.fy = null;
        });

    nodeSel.call(dragBehavior);
}
