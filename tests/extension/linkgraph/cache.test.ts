import { describe, it, expect } from "vitest";
import { deserializeCache, serializeCache, pruneCache } from "@/extension/linkgraph/cache";
import type { CacheEntry } from "@/extension/linkgraph/cache";

const entry1: CacheEntry = {
    mtime: 1730000000000,
    outbound: [{ kind: "link", href: "./other.md", line: 5, lineText: "see [other](./other.md)" }],
};

const entry2: CacheEntry = {
    mtime: 1730000001000,
    outbound: [],
};

describe("serializeCache / deserializeCache (round-trip)", () => {
    it("round-trips a non-empty cache", () => {
        const original = new Map([
            ["docs/note.md", entry1],
            ["docs/empty.md", entry2],
        ]);
        const json = serializeCache(original);
        const restored = deserializeCache(json);
        expect(restored.size).toBe(2);
        expect(restored.get("docs/note.md")).toEqual(entry1);
        expect(restored.get("docs/empty.md")).toEqual(entry2);
    });

    it("round-trips an empty cache", () => {
        const json = serializeCache(new Map());
        const restored = deserializeCache(json);
        expect(restored.size).toBe(0);
    });

    it("produces valid JSON with version field", () => {
        const json = serializeCache(new Map([["a.md", entry1]]));
        const parsed = JSON.parse(json);
        expect(parsed.version).toBe(2);
        expect(parsed.entries["a.md"]).toBeDefined();
    });
});

describe("deserializeCache", () => {
    it("returns empty map on invalid JSON", () => {
        const result = deserializeCache("not json");
        expect(result.size).toBe(0);
    });

    it("discards cache on version mismatch", () => {
        const bad = JSON.stringify({ version: 99, entries: { "a.md": entry1 } });
        const result = deserializeCache(bad);
        expect(result.size).toBe(0);
    });

    it("discards cache when version is missing", () => {
        const bad = JSON.stringify({ entries: { "a.md": entry1 } });
        const result = deserializeCache(bad);
        expect(result.size).toBe(0);
    });

    it("skips invalid entries but keeps valid ones", () => {
        const mixed = JSON.stringify({
            version: 2,
            entries: {
                "good.md": entry1,
                "bad.md": { mtime: "notanumber", outbound: [] },
                "missing-outbound.md": { mtime: 123 },
            },
        });
        const result = deserializeCache(mixed);
        expect(result.size).toBe(1);
        expect(result.has("good.md")).toBe(true);
    });

    it("returns empty map for non-object input", () => {
        expect(deserializeCache('"string"').size).toBe(0);
        expect(deserializeCache("42").size).toBe(0);
        expect(deserializeCache("null").size).toBe(0);
    });
});

describe("pruneCache", () => {
    it("removes entries for non-existent keys", () => {
        const entries = new Map([
            ["docs/note.md", entry1],
            ["docs/deleted.md", entry2],
        ]);
        const existing = new Set(["docs/note.md"]);
        const pruned = pruneCache(entries, existing);
        expect(pruned.size).toBe(1);
        expect(pruned.has("docs/note.md")).toBe(true);
        expect(pruned.has("docs/deleted.md")).toBe(false);
    });

    it("returns empty map when nothing exists", () => {
        const entries = new Map([["docs/note.md", entry1]]);
        const pruned = pruneCache(entries, new Set());
        expect(pruned.size).toBe(0);
    });

    it("does not mutate the original map", () => {
        const entries = new Map([["a.md", entry1], ["b.md", entry2]]);
        pruneCache(entries, new Set(["a.md"]));
        expect(entries.size).toBe(2);
    });
});
