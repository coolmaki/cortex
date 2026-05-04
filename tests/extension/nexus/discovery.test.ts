import { describe, it, expect } from "vitest";
import { pickActive } from "@/extension/nexus/discovery";
import type * as vscode from "vscode";

function makeFolder(name: string, uri: string): vscode.WorkspaceFolder {
    return { name, index: 0, uri: { toString: () => uri } as unknown as vscode.Uri };
}

describe("pickActive", () => {
    const folderA = makeFolder("A", "file:///a");
    const folderB = makeFolder("B", "file:///b");
    const folderC = makeFolder("C", "file:///c");

    it("returns undefined when candidates is empty", () => {
        expect(pickActive([], undefined)).toBeUndefined();
        expect(pickActive([], "file:///a")).toBeUndefined();
    });

    it("returns first candidate when no previous URI", () => {
        expect(pickActive([folderA, folderB], undefined)).toBe(folderA);
    });

    it("restores the previously-active folder when still present", () => {
        expect(pickActive([folderA, folderB], "file:///b")).toBe(folderB);
    });

    it("falls back to first candidate when previous URI is gone", () => {
        expect(pickActive([folderA, folderB], "file:///c")).toBe(folderA);
    });

    it("returns the sole candidate regardless of prevUri", () => {
        expect(pickActive([folderC], "file:///a")).toBe(folderC);
        expect(pickActive([folderC], undefined)).toBe(folderC);
    });
});
