import { describe, it, expect } from "vitest";
import { pickMetadata, renderStrip } from "@/webviews/reader/metadata";

describe("pickMetadata", () => {
    it("extracts all three fields when present", () => {
        const meta = pickMetadata({ tags: ["a", "b"], type: "task", status: "in-progress" });
        expect(meta).toEqual({ tags: ["a", "b"], type: "task", status: "in-progress" });
    });

    it("returns empty tags array when tags is absent", () => {
        const meta = pickMetadata({ type: "note" });
        expect(meta.tags).toEqual([]);
    });

    it("returns undefined for type and status when absent", () => {
        const meta = pickMetadata({});
        expect(meta.type).toBeUndefined();
        expect(meta.status).toBeUndefined();
    });

    it("ignores non-string tags entries", () => {
        const meta = pickMetadata({ tags: ["good", 42 as unknown as string, null as unknown as string] });
        expect(meta.tags).toEqual(["good"]);
    });
});

describe("renderStrip", () => {
    it("returns empty string when no metadata is present", () => {
        expect(renderStrip({ tags: [], type: undefined, status: undefined })).toBe("");
    });

    it("renders type and status as badges", () => {
        const html = renderStrip({ tags: [], type: "task", status: "done" });
        expect(html).toContain("meta-badge");
        expect(html).toContain("task");
        expect(html).toContain("done");
    });

    it("renders tags as chips with # prefix", () => {
        const html = renderStrip({ tags: ["alpha", "beta"], type: undefined, status: undefined });
        expect(html).toContain("meta-chip");
        expect(html).toContain("#alpha");
        expect(html).toContain("#beta");
    });

    it("escapes HTML in metadata values", () => {
        const html = renderStrip({ tags: ["<script>"], type: undefined, status: undefined });
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });
});
