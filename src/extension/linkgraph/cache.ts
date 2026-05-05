import type { ParsedLink } from "./parse";

const CACHE_VERSION = 1;

export interface CacheEntry {
    mtime: number;
    outbound: ParsedLink[];
}

export interface CacheSchema {
    version: number;
    entries: Record<string, CacheEntry>;
}

export function deserializeCache(raw: string): Map<string, CacheEntry> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return new Map();
    }

    if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as CacheSchema).version !== CACHE_VERSION
    ) {
        return new Map();
    }

    const schema = parsed as CacheSchema;
    const result = new Map<string, CacheEntry>();

    if (typeof schema.entries !== "object" || schema.entries === null) {
        return result;
    }

    for (const [key, value] of Object.entries(schema.entries)) {
        if (isValidEntry(value)) {
            result.set(key, value);
        }
    }

    return result;
}

export function serializeCache(entries: Map<string, CacheEntry>): string {
    const obj: CacheSchema = {
        version: CACHE_VERSION,
        entries: Object.fromEntries(entries),
    };
    return JSON.stringify(obj, null, 2);
}

export function pruneCache(
    entries: Map<string, CacheEntry>,
    existingKeys: Set<string>,
): Map<string, CacheEntry> {
    const pruned = new Map<string, CacheEntry>();
    for (const [key, value] of entries) {
        if (existingKeys.has(key)) {
            pruned.set(key, value);
        }
    }
    return pruned;
}

function isValidEntry(value: unknown): value is CacheEntry {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const v = value as Record<string, unknown>;
    return typeof v.mtime === "number" && Array.isArray(v.outbound);
}
