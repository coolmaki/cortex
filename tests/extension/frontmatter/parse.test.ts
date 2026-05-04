import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "@/extension/frontmatter/parse";

describe("parseFrontmatter", () => {
    it("extracts title from valid frontmatter", () => {
        const result = parseFrontmatter("---\ntitle: My Note\n---\nContent here.");
        expect(result).toEqual({ title: "My Note", data: { title: "My Note" } });
    });

    it("trims whitespace from title", () => {
        const result = parseFrontmatter("---\ntitle:   Spaced Out   \n---\n");
        expect(result?.title).toBe("Spaced Out");
    });

    it("returns null when title is missing", () => {
        const result = parseFrontmatter("---\nauthor: Alice\n---\nContent.");
        expect(result).toBeNull();
    });

    it("returns null when title is empty string", () => {
        const result = parseFrontmatter('---\ntitle: ""\n---\n');
        expect(result).toBeNull();
    });

    it("returns null when title is whitespace only", () => {
        const result = parseFrontmatter('---\ntitle: "   "\n---\n');
        expect(result).toBeNull();
    });

    it("returns null when there is no frontmatter", () => {
        const result = parseFrontmatter("Just a plain markdown file.");
        expect(result).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(parseFrontmatter("")).toBeNull();
    });

    it("returns null when title is not a string", () => {
        const result = parseFrontmatter("---\ntitle: 42\n---\n");
        expect(result).toBeNull();
    });

    it("carries through extra frontmatter fields in data", () => {
        const result = parseFrontmatter("---\ntitle: Doc\ntags: [a, b]\n---\n");
        expect(result?.data.tags).toEqual(["a", "b"]);
    });

    it("returns null for malformed YAML frontmatter", () => {
        const result = parseFrontmatter("---\ntitle: [unclosed\n---\n");
        expect(result).toBeNull();
    });
});
