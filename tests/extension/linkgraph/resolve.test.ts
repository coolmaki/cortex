import { describe, it, expect } from "vitest";
import { resolveHref } from "@/extension/linkgraph/resolve";

const nexus = "/Users/user/project";
const source = "/Users/user/project/docs/note.md";

describe("resolveHref", () => {
    it("resolves a relative .md link inside the nexus", () => {
        const result = resolveHref("./other.md", source, nexus);
        expect(result).toBe("/Users/user/project/docs/other.md");
    });

    it("resolves a parent-relative .md link inside the nexus", () => {
        const result = resolveHref("../root.md", source, nexus);
        expect(result).toBe("/Users/user/project/root.md");
    });

    it("returns null for anchor-only href", () => {
        expect(resolveHref("#section", source, nexus)).toBeNull();
    });

    it("returns null for https:// links", () => {
        expect(resolveHref("https://example.com/page.md", source, nexus)).toBeNull();
    });

    it("returns null for http:// links", () => {
        expect(resolveHref("http://example.com/page.md", source, nexus)).toBeNull();
    });

    it("returns null for mailto: links", () => {
        expect(resolveHref("mailto:user@example.com", source, nexus)).toBeNull();
    });

    it("returns null for tel: links", () => {
        expect(resolveHref("tel:+1234567890", source, nexus)).toBeNull();
    });

    it("returns null for non-.md files", () => {
        expect(resolveHref("./image.png", source, nexus)).toBeNull();
        expect(resolveHref("./script.js", source, nexus)).toBeNull();
    });

    it("returns null when path escapes the nexus", () => {
        const result = resolveHref("../../outside.md", source, nexus);
        expect(result).toBeNull();
    });

    it("returns null for empty href", () => {
        expect(resolveHref("", source, nexus)).toBeNull();
    });

    it("keeps the path including anchor in href but strips it from resolution", () => {
        const result = resolveHref("./other.md#section", source, nexus);
        expect(result).toBe("/Users/user/project/docs/other.md");
    });

    it("resolves a link at the nexus root level", () => {
        const rootSource = "/Users/user/project/index.md";
        const result = resolveHref("./docs/note.md", rootSource, nexus);
        expect(result).toBe("/Users/user/project/docs/note.md");
    });
});
