import { describe, it, expect } from "vitest";
import { classifyLink } from "@/extension/reader/classify";
import path from "path";

const nexus = path.join("/", "workspace", "my-nexus");
const currentFile = path.join(nexus, "docs", "note.md");

describe("classifyLink", () => {
    it("classifies a #anchor href as anchor", () => {
        expect(classifyLink("#installation", currentFile, nexus)).toEqual({
            kind: "anchor",
            id: "installation",
        });
    });

    it("classifies https URLs as external", () => {
        expect(classifyLink("https://github.com", currentFile, nexus)).toEqual({
            kind: "external",
            url: "https://github.com",
        });
    });

    it("classifies http URLs as external", () => {
        expect(classifyLink("http://example.com/page", currentFile, nexus)).toEqual({
            kind: "external",
            url: "http://example.com/page",
        });
    });

    it("classifies mailto as external", () => {
        expect(classifyLink("mailto:user@example.com", currentFile, nexus)).toEqual({
            kind: "external",
            url: "mailto:user@example.com",
        });
    });

    it("resolves a sibling .md file as internal", () => {
        const result = classifyLink("./other.md", currentFile, nexus);
        expect(result.kind).toBe("internal");
        if (result.kind === "internal") {
            expect(result.fsPath).toBe(path.join(nexus, "docs", "other.md"));
            expect(result.anchor).toBeUndefined();
        }
    });

    it("resolves a relative path without ./ prefix as internal", () => {
        const result = classifyLink("other.md", currentFile, nexus);
        expect(result.kind).toBe("internal");
    });

    it("extracts anchor from an internal link", () => {
        const result = classifyLink("./other.md#section", currentFile, nexus);
        expect(result.kind).toBe("internal");
        if (result.kind === "internal") {
            expect(result.anchor).toBe("section");
        }
    });

    it("resolves a parent directory traversal that stays within nexus", () => {
        const result = classifyLink("../README.md", currentFile, nexus);
        expect(result.kind).toBe("internal");
        if (result.kind === "internal") {
            expect(result.fsPath).toBe(path.join(nexus, "README.md"));
        }
    });

    it("classifies a link that escapes the nexus as outside-nexus", () => {
        expect(classifyLink("../../secret.md", currentFile, nexus)).toEqual({
            kind: "outside-nexus",
        });
    });

    it("does not falsely match a nexus path prefix in another sibling folder", () => {
        const siblingNexus = path.join("/", "workspace", "my-nexus-extra", "file.md");
        const result = classifyLink(siblingNexus, currentFile, nexus);
        expect(result.kind).toBe("outside-nexus");
    });
});
