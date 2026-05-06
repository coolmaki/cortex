import type { HostMessage, ThemeKind, WebviewMessage } from "./messaging";
import { filterNodes } from "./search";
import { GraphSimulation, toSimEdges, toSimNodes } from "./simulation";
import type { SimEdge, SimNode } from "./simulation";
import { initSvg, bindData, applyTick } from "./render";
import type { NodeSel, EdgeSel } from "./render";
import { applyZoom, applyDrag } from "./interactions";
import { applySearch, clearHover, setActiveNode, setHover } from "./highlight";

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();

function post(msg: WebviewMessage): void {
    vscode.postMessage(msg);
}

// ── state ─────────────────────────────────────────────────────────────────────

let simulation: GraphSimulation | undefined;
let svgEl: SVGSVGElement | undefined;
let viewportEl: SVGGElement | undefined;
let currentSimNodes: SimNode[] = [];
let currentSimEdges: SimEdge[] = [];
let nodeSel: NodeSel | undefined;
let edgeSel: EdgeSel | undefined;
let nodeElMap = new Map<string, SVGGElement>();
let edgeElArr: SVGLineElement[] = [];
let activeUri: string | undefined;
let searchQuery = "";

// ── DOM refs ──────────────────────────────────────────────────────────────────

const emptyEl = document.getElementById("empty-state") as HTMLElement;
const emptyMsg = document.getElementById("empty-message") as HTMLParagraphElement;
const containerEl = document.getElementById("graph-container") as HTMLElement;
const searchEl = document.getElementById("search") as HTMLInputElement;

// ── helpers ───────────────────────────────────────────────────────────────────

function viewportSize(): { w: number; h: number } {
    return { w: window.innerWidth, h: window.innerHeight - 48 };
}

function showEmpty(reason: "no-nexus" | "no-docs"): void {
    emptyEl.hidden = false;
    containerEl.hidden = true;
    emptyMsg.textContent =
        reason === "no-nexus" ? "No nexus is active." : "This nexus has no titled documents.";
}

function hideEmpty(): void {
    emptyEl.hidden = true;
    containerEl.hidden = false;
}

function applyTheme(kind: ThemeKind): void {
    document.body.dataset.theme = kind === "dark" || kind === "high-contrast" ? "dark" : "light";
}

function buildNodeElMap(): void {
    nodeElMap = new Map();
    const groups = containerEl.querySelectorAll<SVGGElement>("g.node");
    for (const g of groups) {
        const uri = (g as SVGGElement & { __data__: SimNode }).__data__?.uri;
        if (uri) {
            nodeElMap.set(uri, g);
        }
    }
}

function buildEdgeElArr(): void {
    edgeElArr = Array.from(containerEl.querySelectorAll<SVGLineElement>("line.edge"));
}

function wireNodeHandlers(sel: NodeSel): void {
    sel
        .on("click", (_event, d) => {
            post({ type: "openNode", uri: d.uri });
        })
        .on("mouseenter", (_event, d) => {
            setHover(d.uri, nodeElMap, edgeElArr, currentSimEdges);
        })
        .on("mouseleave", () => {
            clearHover(nodeElMap, edgeElArr);
            if (searchQuery) {
                const matched = filterNodes(searchQuery, currentSimNodes);
                applySearch(
                    matched,
                    currentSimNodes.map((n) => n.uri),
                    nodeElMap,
                    edgeElArr,
                );
            }
        });
}

function annotateEdgeEls(): void {
    // Store source/target URIs as data attributes for highlight.ts
    const lines = containerEl.querySelectorAll<SVGLineElement>("line.edge");
    let i = 0;
    for (const line of lines) {
        const edge = currentSimEdges[i++];
        if (edge) {
            line.dataset.sourceUri = edge.sourceUri;
            line.dataset.targetUri = edge.targetUri;
        }
    }
}

// ── init ──────────────────────────────────────────────────────────────────────

function initGraph(nodes: SimNode[], edges: SimEdge[]): void {
    const { w, h } = viewportSize();

    if (!svgEl) {
        const result = initSvg(containerEl);
        svgEl = result.svg;
        viewportEl = result.viewport;
        applyZoom(svgEl, viewportEl);
    }

    simulation?.stop();
    simulation = new GraphSimulation(w, h);

    simulation.setData(nodes, edges);

    const bound = bindData(nodes, edges);
    nodeSel = bound.nodeSel;
    edgeSel = bound.edgeSel;

    wireNodeHandlers(nodeSel);
    applyDrag(nodeSel, simulation);
    annotateEdgeEls();
    buildNodeElMap();
    buildEdgeElArr();

    simulation.onTick(() => {
        if (nodeSel && edgeSel) {
            applyTick(nodeSel, edgeSel);
        }
    });

    simulation.restart();
    setActiveNode(activeUri, nodeElMap);
}

// ── update ────────────────────────────────────────────────────────────────────

function updateGraph(nodes: SimNode[], edges: SimEdge[]): void {
    if (!simulation || !svgEl) {
        initGraph(nodes, edges);
        return;
    }

    simulation.setData(nodes, edges);

    const bound = bindData(nodes, edges);
    nodeSel = bound.nodeSel;
    edgeSel = bound.edgeSel;

    wireNodeHandlers(nodeSel);
    applyDrag(nodeSel, simulation);
    annotateEdgeEls();
    buildNodeElMap();
    buildEdgeElArr();

    simulation.nudge();
    setActiveNode(activeUri, nodeElMap);
}

// ── message handler ────────────────────────────────────────────────────────────

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
    const msg = event.data;

    switch (msg.type) {
        case "init": {
            if (msg.mode === "empty") {
                showEmpty(msg.reason);
                return;
            }
            hideEmpty();
            applyTheme(msg.themeKind);

            const { w, h } = viewportSize();
            currentSimNodes = toSimNodes(msg.graph.nodes, new Map(), w / 2, h / 2);
            currentSimEdges = toSimEdges(msg.graph.edges);
            initGraph(currentSimNodes, currentSimEdges);
            break;
        }

        case "update": {
            const prevMap = new Map(currentSimNodes.map((n) => [n.uri, n]));
            const { w, h } = viewportSize();
            currentSimNodes = toSimNodes(msg.graph.nodes, prevMap, w / 2, h / 2);
            currentSimEdges = toSimEdges(msg.graph.edges);
            updateGraph(currentSimNodes, currentSimEdges);
            break;
        }

        case "themeChanged": {
            applyTheme(msg.themeKind);
            break;
        }

        case "activeFileChanged": {
            activeUri = msg.uri;
            setActiveNode(activeUri, nodeElMap);
            break;
        }
    }
});

// ── search ─────────────────────────────────────────────────────────────────────

searchEl.addEventListener("input", () => {
    searchQuery = searchEl.value.trim();
    const matched = filterNodes(searchQuery, currentSimNodes);
    applySearch(
        matched,
        currentSimNodes.map((n) => n.uri),
        nodeElMap,
        edgeElArr,
    );
});

// ── resize ─────────────────────────────────────────────────────────────────────

window.addEventListener("resize", () => {
    const { w, h } = viewportSize();
    simulation?.updateCenter(w, h);
    if (svgEl) {
        svgEl.setAttribute("width", String(w));
        svgEl.setAttribute("height", String(h));
    }
});

// ── ready ──────────────────────────────────────────────────────────────────────

post({ type: "ready" });
