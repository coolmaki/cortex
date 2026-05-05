import { describe, it, expect } from "vitest";
import { GroupingService } from "@/extension/grouping/service";
import type { SiblingEntry } from "@/extension/grouping/service";

function mkFile(basename: string, group?: string[]): SiblingEntry {
    return {
        uri: `file:///folder/${basename}`,
        basename,
        isDirectory: false,
        isIndex: false,
        group,
    };
}

function mkDir(basename: string): SiblingEntry {
    return {
        uri: `file:///folder/${basename}`,
        basename,
        isDirectory: true,
        isIndex: false,
    };
}

function mkIndex(basename: string): SiblingEntry {
    return {
        uri: `file:///folder/${basename}`,
        basename,
        isDirectory: false,
        isIndex: true,
    };
}

describe("GroupingService.resolve", () => {
    const service = new GroupingService();

    it("single parent absorbs matching siblings", () => {
        const siblings = [
            mkFile("webapp.md", ["webapp-*"]),
            mkFile("webapp-frontend.md"),
            mkFile("webapp-backend.md"),
            mkFile("unrelated.md"),
        ];
        const result = service.resolve(siblings);

        expect(result.logicalChildren.get("file:///folder/webapp.md")).toEqual([
            "file:///folder/webapp-backend.md",
            "file:///folder/webapp-frontend.md",
        ]);
        expect(result.suppressedSiblings).toContain("file:///folder/webapp-frontend.md");
        expect(result.suppressedSiblings).toContain("file:///folder/webapp-backend.md");
        expect(result.suppressedSiblings).not.toContain("file:///folder/unrelated.md");
    });

    it("multi-parent with shared child", () => {
        const siblings = [
            mkFile("a.md", ["shared.md"]),
            mkFile("b.md", ["shared.md"]),
            mkFile("shared.md"),
        ];
        const result = service.resolve(siblings);

        // shared appears under both a and b
        expect(result.logicalChildren.get("file:///folder/a.md")).toContain(
            "file:///folder/shared.md",
        );
        expect(result.logicalChildren.get("file:///folder/b.md")).toContain(
            "file:///folder/shared.md",
        );
        expect(result.suppressedSiblings).toContain("file:///folder/shared.md");
        // primary parent is alphabetically first: a.md
        expect(result.primaryParent.get("file:///folder/shared.md")).toBe(
            "file:///folder/a.md",
        );
    });

    it("cycle (a groups b, b groups a) resolved by alphabetical first-write", () => {
        const siblings = [
            mkFile("cycle-a.md", ["cycle-b.md"]),
            mkFile("cycle-b.md", ["cycle-a.md"]),
        ];
        const result = service.resolve(siblings);

        // cycle-a processes first (alphabetically); it adopts cycle-b
        expect(result.logicalChildren.get("file:///folder/cycle-a.md")).toEqual([
            "file:///folder/cycle-b.md",
        ]);
        // cycle-b tries to adopt cycle-a but cycle-a already adopted cycle-b → cycle detected → skip
        expect(result.logicalChildren.has("file:///folder/cycle-b.md")).toBe(false);
        expect(result.suppressedSiblings).toContain("file:///folder/cycle-b.md");
        expect(result.suppressedSiblings).not.toContain("file:///folder/cycle-a.md");
    });

    it("child appears under multiple parents", () => {
        const siblings = [
            mkFile("parent1.md", ["child.md"]),
            mkFile("parent2.md", ["child.md"]),
            mkFile("child.md"),
        ];
        const result = service.resolve(siblings);
        expect(result.logicalChildren.get("file:///folder/parent1.md")).toContain(
            "file:///folder/child.md",
        );
        expect(result.logicalChildren.get("file:///folder/parent2.md")).toContain(
            "file:///folder/child.md",
        );
    });

    it("empty group array is a no-op", () => {
        const siblings = [mkFile("hub.md", []), mkFile("a.md"), mkFile("b.md")];
        const result = service.resolve(siblings);
        expect(result.logicalChildren.size).toBe(0);
        expect(result.suppressedSiblings.size).toBe(0);
    });

    it("no group frontmatter is a no-op", () => {
        const siblings = [mkFile("hub.md"), mkFile("a.md")];
        const result = service.resolve(siblings);
        expect(result.logicalChildren.size).toBe(0);
    });

    it("directories can be adopted as logical children", () => {
        const siblings = [
            mkFile("parent.md", ["webapp-*"]),
            mkDir("webapp-components"),
            mkFile("other.md"),
        ];
        const result = service.resolve(siblings);
        expect(result.logicalChildren.get("file:///folder/parent.md")).toContain(
            "file:///folder/webapp-components",
        );
        expect(result.suppressedSiblings).toContain("file:///folder/webapp-components");
    });

    it("index files are never adopted", () => {
        const siblings = [mkFile("hub.md", ["*"]), mkIndex("README.md"), mkFile("a.md")];
        const result = service.resolve(siblings);
        const children = result.logicalChildren.get("file:///folder/hub.md") ?? [];
        expect(children).not.toContain("file:///folder/README.md");
    });
});
