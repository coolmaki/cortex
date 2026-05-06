export type ThemeKind = "light" | "dark" | "high-contrast" | "high-contrast-light";

export interface GraphNode {
    uri: string;
    label: string;
    relPath: string;
    inDegree: number;
    outDegree: number;
}

export interface GraphEdge {
    sourceUri: string;
    targetUri: string;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export type HostMessage =
    | { type: "init"; mode: "normal"; graph: GraphData; themeKind: ThemeKind }
    | { type: "init"; mode: "empty"; reason: "no-nexus" | "no-docs" }
    | { type: "update"; graph: GraphData }
    | { type: "themeChanged"; themeKind: ThemeKind }
    | { type: "activeFileChanged"; uri: string | undefined };

export type WebviewMessage =
    | { type: "ready" }
    | { type: "openNode"; uri: string }
    | { type: "reload" };
