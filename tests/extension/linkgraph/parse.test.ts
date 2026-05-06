import { describe, it, expect } from "vitest";
import { parseLinks } from "@/extension/linkgraph/parse";

describe("parseLinks", () => {
    it("captures a plain markdown link", () => {
        const result = parseLinks("[other](./other.md)");
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ kind: "link", href: "./other.md", line: 1 });
    });

    it("captures an image reference", () => {
        const result = parseLinks("![alt](./image.png)");
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ kind: "image", href: "./image.png", line: 1 });
    });

    it("filters out anchor-only links", () => {
        const result = parseLinks("[section](#heading)");
        expect(result).toHaveLength(0);
    });

    it("filters out https:// links", () => {
        const result = parseLinks("[ext](https://example.com)");
        expect(result).toHaveLength(0);
    });

    it("filters out http:// links", () => {
        const result = parseLinks("[ext](http://example.com)");
        expect(result).toHaveLength(0);
    });

    it("filters out mailto: links", () => {
        const result = parseLinks("[email](mailto:foo@bar.com)");
        expect(result).toHaveLength(0);
    });

    it("filters out tel: links", () => {
        const result = parseLinks("[phone](tel:+1234567890)");
        expect(result).toHaveLength(0);
    });

    it("keeps link with anchor fragment in href verbatim", () => {
        const result = parseLinks("[other](./other.md#section)");
        expect(result).toHaveLength(1);
        expect(result[0].href).toBe("./other.md#section");
    });

    it("captures link inside a list item", () => {
        const source = "- item one\n- [link](./doc.md)\n- item three";
        const result = parseLinks(source);
        expect(result).toHaveLength(1);
        expect(result[0].href).toBe("./doc.md");
        expect(result[0].line).toBe(2);
    });

    it("captures link inside a blockquote", () => {
        const source = "> See [here](./ref.md) for more.";
        const result = parseLinks(source);
        expect(result).toHaveLength(1);
        expect(result[0].href).toBe("./ref.md");
    });

    it("reports the correct line for a link inside a table cell", () => {
        const source = [
            "intro",
            "",
            "| File | Notes |",
            "|------|-------|",
            "| [a](./a.md) | first |",
            "| [b](./b.md) | second |",
        ].join("\n");
        const result = parseLinks(source);
        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ href: "./a.md", line: 5 });
        expect(result[1]).toMatchObject({ href: "./b.md", line: 6 });
    });

    it("excludes links inside fenced code blocks", () => {
        const source = "```\n[link](./not-a-link.md)\n```";
        const result = parseLinks(source);
        expect(result).toHaveLength(0);
    });

    it("excludes links inside inline code", () => {
        const source = "Use `[link](./not.md)` as example.";
        const result = parseLinks(source);
        expect(result).toHaveLength(0);
    });

    it("captures multiple links on the same line with same line number", () => {
        const source = "[a](./a.md) and [b](./b.md)";
        const result = parseLinks(source);
        expect(result).toHaveLength(2);
        expect(result[0].line).toBe(result[1].line);
    });

    it("truncates lineText to 120 chars plus ellipsis", () => {
        const longLine = "x".repeat(130);
        const source = `[link](./doc.md) ${longLine}`;
        const result = parseLinks(source);
        expect(result).toHaveLength(1);
        expect(result[0].lineText.length).toBe(121); // 120 + "…"
        expect(result[0].lineText.endsWith("…")).toBe(true);
    });

    it("does not throw on malformed markdown", () => {
        expect(() => parseLinks("[unclosed](")).not.toThrow();
        expect(() => parseLinks("![](")).not.toThrow();
        expect(() => parseLinks("")).not.toThrow();
    });

    it("returns empty for no links", () => {
        const result = parseLinks("# Just a heading\n\nSome text with no links.");
        expect(result).toHaveLength(0);
    });
});
