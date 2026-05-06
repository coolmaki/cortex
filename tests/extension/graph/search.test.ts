import { describe, it, expect } from "vitest";
import { filterNodes } from "@/webviews/graph/search";
import type { GraphNode } from "@/webviews/graph/messaging";

function node(uri: string, label: string): GraphNode {
    return { uri, label, relPath: `${label}.md`, inDegree: 0, outDegree: 0 };
}

const nodes: GraphNode[] = [
    node("file:///alpha.md", "Alpha"),
    node("file:///beta.md", "Beta"),
    node("file:///gamma.md", "Gamma"),
];

describe("filterNodes", () => {
    it("empty query returns all node URIs", () => {
        const result = filterNodes("", nodes);
        expect(result.size).toBe(3);
        for (const n of nodes) {
            expect(result.has(n.uri)).toBe(true);
        }
    });

    it("matches substring case-insensitively", () => {
        const result = filterNodes("alpha", nodes);
        expect(result.size).toBe(1);
        expect(result.has("file:///alpha.md")).toBe(true);
    });

    it("matches uppercase query against lowercase label", () => {
        const result = filterNodes("BETA", nodes);
        expect(result.size).toBe(1);
        expect(result.has("file:///beta.md")).toBe(true);
    });

    it("no-match query returns empty set", () => {
        const result = filterNodes("zzz", nodes);
        expect(result.size).toBe(0);
    });

    it("partial substring matches multiple nodes", () => {
        // "ph" appears in "Alpha" but not in "Gamma" or "Beta"
        const result = filterNodes("ph", [
            node("file:///alpha.md", "Alpha"),
            node("file:///gamma.md", "Gamma"),
            node("file:///beta.md", "Beta"),
        ]);
        expect(result.has("file:///alpha.md")).toBe(true);
        expect(result.has("file:///gamma.md")).toBe(false);
        expect(result.has("file:///beta.md")).toBe(false);
    });
});
