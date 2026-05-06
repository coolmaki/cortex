import { describe, it, expect } from "vitest";
import { HistoryStack } from "@/webviews/reader/nav";

function entry(uri: string, scrollY = 0) {
    return {
        fileUri: uri,
        baseUri: uri,
        relPath: uri,
        scrollY,
        html: "",
        stripHtml: "",
        frontmatter: {},
    };
}

describe("HistoryStack", () => {
    it("starts with no history", () => {
        const h = new HistoryStack();
        expect(h.current()).toBeUndefined();
        expect(h.canGoBack()).toBe(false);
        expect(h.canGoForward()).toBe(false);
    });

    it("push adds an entry and sets it as current", () => {
        const h = new HistoryStack();
        h.push(entry("/a"));
        expect(h.current()?.fileUri).toBe("/a");
        expect(h.canGoBack()).toBe(false);
    });

    it("push of a second entry enables back navigation", () => {
        const h = new HistoryStack();
        h.push(entry("/a"));
        h.push(entry("/b"));
        expect(h.canGoBack()).toBe(true);
        expect(h.canGoForward()).toBe(false);
    });

    it("back returns previous entry and updates cursor", () => {
        const h = new HistoryStack();
        h.push(entry("/a", 10));
        h.push(entry("/b", 20));
        const prev = h.back();
        expect(prev?.fileUri).toBe("/a");
        expect(h.current()?.fileUri).toBe("/a");
    });

    it("back returns undefined at the start of history", () => {
        const h = new HistoryStack();
        h.push(entry("/a"));
        expect(h.back()).toBeUndefined();
    });

    it("forward returns next entry after going back", () => {
        const h = new HistoryStack();
        h.push(entry("/a"));
        h.push(entry("/b"));
        h.back();
        const next = h.forward();
        expect(next?.fileUri).toBe("/b");
        expect(h.current()?.fileUri).toBe("/b");
    });

    it("forward returns undefined at the end of history", () => {
        const h = new HistoryStack();
        h.push(entry("/a"));
        expect(h.forward()).toBeUndefined();
    });

    it("push truncates forward history", () => {
        const h = new HistoryStack();
        h.push(entry("/a"));
        h.push(entry("/b"));
        h.back();
        h.push(entry("/c"));
        expect(h.canGoForward()).toBe(false);
        expect(h.current()?.fileUri).toBe("/c");
    });

    it("updateScrollY updates the scroll of the current entry", () => {
        const h = new HistoryStack();
        h.push(entry("/a"));
        h.updateScrollY(500);
        expect(h.current()?.scrollY).toBe(500);
    });

    it("restores scrollY when navigating back", () => {
        const h = new HistoryStack();
        h.push(entry("/a"));
        h.updateScrollY(300);
        h.push(entry("/b"));
        const prev = h.back();
        expect(prev?.scrollY).toBe(300);
    });

    it("updateCache stores html on the current entry", () => {
        const h = new HistoryStack();
        h.push(entry("/a"));
        h.updateCache("<p>hi</p>", "<span>strip</span>");
        expect(h.current()?.html).toBe("<p>hi</p>");
        expect(h.current()?.stripHtml).toBe("<span>strip</span>");
    });

    it("replaceCurrent overwrites the current entry without growing history", () => {
        const h = new HistoryStack();
        h.push(entry("/a"));
        h.replaceCurrent(entry("/b"));
        expect(h.current()?.fileUri).toBe("/b");
        expect(h.canGoBack()).toBe(false);
    });
});
