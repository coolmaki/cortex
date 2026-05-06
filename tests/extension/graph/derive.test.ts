import { describe, it, expect } from "vitest";
import { buildGraph } from "@/extension/graph/derive";

describe("buildGraph", () => {
    it("single doc with no edges produces 1 node and 0 edges", () => {
        const result = buildGraph(
            [{ uriString: "file:///a.md", relPath: "a.md" }],
            () => "Doc A",
            () => [],
        );
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0]).toMatchObject({ uri: "file:///a.md", label: "Doc A", inDegree: 0, outDegree: 0 });
        expect(result.edges).toHaveLength(0);
    });

    it("two docs linked one-way produce 2 nodes and 1 edge with correct degrees", () => {
        const result = buildGraph(
            [
                { uriString: "file:///a.md", relPath: "a.md" },
                { uriString: "file:///b.md", relPath: "b.md" },
            ],
            (uri) => (uri === "file:///a.md" ? "Doc A" : "Doc B"),
            (uri) => (uri === "file:///a.md" ? ["file:///b.md"] : []),
        );
        expect(result.nodes).toHaveLength(2);
        expect(result.edges).toHaveLength(1);
        expect(result.edges[0]).toMatchObject({ sourceUri: "file:///a.md", targetUri: "file:///b.md" });
        const a = result.nodes.find((n) => n.uri === "file:///a.md")!;
        const b = result.nodes.find((n) => n.uri === "file:///b.md")!;
        expect(a.outDegree).toBe(1);
        expect(a.inDegree).toBe(0);
        expect(b.inDegree).toBe(1);
        expect(b.outDegree).toBe(0);
    });

    it("untitled source is excluded and produces no edges", () => {
        const result = buildGraph(
            [
                { uriString: "file:///a.md", relPath: "a.md" },
                { uriString: "file:///b.md", relPath: "b.md" },
            ],
            (uri) => (uri === "file:///b.md" ? "Doc B" : null),
            (uri) => (uri === "file:///a.md" ? ["file:///b.md"] : []),
        );
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].uri).toBe("file:///b.md");
        expect(result.edges).toHaveLength(0);
    });

    it("untitled target causes edge to be dropped, source is kept", () => {
        const result = buildGraph(
            [
                { uriString: "file:///a.md", relPath: "a.md" },
                { uriString: "file:///b.md", relPath: "b.md" },
            ],
            (uri) => (uri === "file:///a.md" ? "Doc A" : null),
            (uri) => (uri === "file:///a.md" ? ["file:///b.md"] : []),
        );
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].uri).toBe("file:///a.md");
        expect(result.edges).toHaveLength(0);
    });

    it("orphan doc with no edges is included as a node with degree 0", () => {
        const result = buildGraph(
            [
                { uriString: "file:///a.md", relPath: "a.md" },
                { uriString: "file:///orphan.md", relPath: "orphan.md" },
            ],
            () => "titled",
            (uri) => (uri === "file:///a.md" ? [] : []),
        );
        expect(result.nodes).toHaveLength(2);
        const orphan = result.nodes.find((n) => n.uri === "file:///orphan.md")!;
        expect(orphan.inDegree).toBe(0);
        expect(orphan.outDegree).toBe(0);
    });

    it("duplicate links between same pair are deduplicated", () => {
        const result = buildGraph(
            [
                { uriString: "file:///a.md", relPath: "a.md" },
                { uriString: "file:///b.md", relPath: "b.md" },
            ],
            () => "titled",
            (uri) => (uri === "file:///a.md" ? ["file:///b.md", "file:///b.md"] : []),
        );
        expect(result.edges).toHaveLength(1);
        expect(result.nodes.find((n) => n.uri === "file:///a.md")!.outDegree).toBe(1);
    });
});
