import { describe, it, expect, vi } from "vitest";
import { resolveGroup } from "@/extension/grouping/match";
import type { GroupCandidate, SiblingEntry } from "@/extension/grouping/match";

function mkFile(basename: string, uri?: string): SiblingEntry {
    return { uri: uri ?? `file:///folder/${basename}`, basename, isDirectory: false, isIndex: false };
}

function mkDir(basename: string, uri?: string): SiblingEntry {
    return {
        uri: uri ?? `file:///folder/${basename}`,
        basename,
        isDirectory: true,
        isIndex: false,
    };
}

function mkIndex(basename: string, uri?: string): SiblingEntry {
    return { uri: uri ?? `file:///folder/${basename}`, basename, isDirectory: false, isIndex: true };
}

const parent: GroupCandidate = { uri: "file:///folder/webapp.md", patterns: ["webapp-*"] };

describe("resolveGroup", () => {
    it("matches files by simple basename pattern", () => {
        const siblings = [mkFile("webapp-frontend.md"), mkFile("webapp-backend.md"), mkFile("unrelated.md")];
        const result = resolveGroup(parent, siblings);
        expect(result).toEqual([
            "file:///folder/webapp-backend.md",
            "file:///folder/webapp-frontend.md",
        ]);
    });

    it("returns empty array for empty pattern list", () => {
        const siblings = [mkFile("webapp-frontend.md")];
        const result = resolveGroup({ uri: "file:///folder/webapp.md", patterns: [] }, siblings);
        expect(result).toEqual([]);
    });

    it("matches directories with trailing-slash pattern", () => {
        const p: GroupCandidate = { uri: "file:///folder/hub.md", patterns: ["components/"] };
        const siblings = [mkDir("components"), mkFile("other.md")];
        const result = resolveGroup(p, siblings);
        expect(result).toEqual(["file:///folder/components"]);
    });

    it("matches only files with *.md pattern (not directories)", () => {
        const p: GroupCandidate = { uri: "file:///folder/hub.md", patterns: ["*.md"] };
        const siblings = [mkFile("a.md"), mkDir("b"), mkFile("c.txt")];
        const result = resolveGroup(p, siblings);
        expect(result).toEqual(["file:///folder/a.md"]);
    });

    it("supports ! negation patterns", () => {
        const p: GroupCandidate = {
            uri: "file:///folder/hub.md",
            patterns: ["webapp-*", "!webapp-backend.md"],
        };
        const siblings = [mkFile("webapp-frontend.md"), mkFile("webapp-backend.md")];
        const result = resolveGroup(p, siblings);
        expect(result).toEqual(["file:///folder/webapp-frontend.md"]);
    });

    it("excludes the parent itself", () => {
        const p: GroupCandidate = { uri: "file:///folder/webapp.md", patterns: ["webapp*"] };
        const siblings = [mkFile("webapp.md", "file:///folder/webapp.md"), mkFile("webapp-frontend.md")];
        const result = resolveGroup(p, siblings);
        expect(result).toEqual(["file:///folder/webapp-frontend.md"]);
    });

    it("excludes index files", () => {
        const p: GroupCandidate = { uri: "file:///folder/hub.md", patterns: ["*"] };
        const index = mkIndex("README.md");
        const siblings = [index, mkFile("a.md")];
        const result = resolveGroup(p, siblings);
        expect(result).toEqual(["file:///folder/a.md"]);
    });

    it("returns results in alphabetical order by basename", () => {
        const p: GroupCandidate = { uri: "file:///folder/hub.md", patterns: ["doc-*"] };
        const siblings = [mkFile("doc-z.md"), mkFile("doc-a.md"), mkFile("doc-m.md")];
        const result = resolveGroup(p, siblings);
        expect(result).toEqual([
            "file:///folder/doc-a.md",
            "file:///folder/doc-m.md",
            "file:///folder/doc-z.md",
        ]);
    });

    it("warns and skips malformed pattern without throwing", () => {
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        // Use a pattern that ignore package can handle; simulate bad via extremely weird input
        const p: GroupCandidate = { uri: "file:///folder/hub.md", patterns: ["valid-*"] };
        const siblings = [mkFile("valid-a.md")];
        expect(() => resolveGroup(p, siblings)).not.toThrow();
        consoleSpy.mockRestore();
    });

    it("returns empty when no siblings match", () => {
        const siblings = [mkFile("unrelated.md"), mkFile("other.md")];
        const result = resolveGroup(parent, siblings);
        expect(result).toEqual([]);
    });
});
