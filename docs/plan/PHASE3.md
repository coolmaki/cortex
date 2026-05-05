---
title: Phase 3 Implementation Plan
---

# Cortex — Phase 3 Implementation Plan

## Context

[`PRD.md`](../PRD.md) specifies **Cortex**, a VS Code extension that turns any workspace folder into a local-first, GitHub-compatible markdown knowledge base. Phases 1 and 2 ([`PHASE1.md`](PHASE1.md), [`PHASE2.md`](PHASE2.md)) shipped the sidebar, Cortex Explorer, nexus discovery, ignore + frontmatter filtering, and a full GitHub-fidelity Reader (markdown-it + Shiki + KaTeX + Mermaid, sticky toolbar/strip, internal navigation, live re-render, soft size limit, GitHub-style heading anchors).

This document covers **Phase 3 only** (PRD §13). Two features ship together:

1. **Logical Nodes** (PRD §5.5) — a `group` frontmatter property that promotes a document into an expandable parent in the Cortex Explorer, absorbing matching siblings as children. Presentation-only; the on-disk layout is unchanged.
2. **Backlinks** (PRD §6.3, §7.1) — a `LinkGraphService` that parses every `.md` in the active nexus, plus a second tree view in the Cortex sidebar that surfaces inbound links to whichever doc the user is reading.

What this phase **does not** include (deferred):

- Graph view (Phase 4) — driven by the same `LinkGraphService` produced here, but the D3 webview itself is a separate milestone.
- Drag-and-drop file moves with link rewriting (Phase 5 stretch).
- Custom Cortex search panel.
- Settings surface (`cortex.*` properties remain hard-coded; promotion in Phase 5).
- Diagnostics for invalid `group` patterns (silent `console.warn` in v1; surfaced via the Problems panel in a later phase).

---

## Locked Decisions for Phase 3

1. **Glob matching reuses the `ignore` package** (already a dependency; powers `.cortex/ignore`). Same gitignore semantics across `group` patterns and `.cortex/ignore` so users have one mental model — basename matches files or folders, trailing slash means folder-only, `!` negates, etc.
2. **Invalid `group` patterns are silently skipped** with a `console.warn`. No user-visible diagnostic in v1; the problem-reporting surface is a Phase 5 concern.
3. **Sort order under a logical parent:** alphabetical by display title, identical to the rest of the explorer.
4. **Backlinks-edge scope:**
   - Markdown links `[text](./path.md)` resolving to a titled `.md` inside the nexus → **counted**, shown in the Backlinks panel.
   - Anchor-only links `[text](#section)` → **not counted** (intra-doc).
   - External `http(s)://` and `mailto:` → **not counted**.
   - Image refs `![alt](./img.png)` → **stored as edges in the link graph for Phase 4 use, but not surfaced in the Backlinks panel** (which is doc→doc only).
   - Links resolving to a folder's index file → counted as a link to the folder's logical doc, displayed using the folder's resolved title (matches the explorer).
5. **Linking-line context:** the trimmed line of source containing the link, truncated to ~120 characters with `…` if longer. Rendered as a child node under each source-doc entry in the Backlinks tree.
6. **Active-file tracking** for the Backlinks panel observes both (a) the Reader's current document and (b) `vscode.window.activeTextEditor` for `.md` files. Reader takes priority when both refer to a titled `.md` in the nexus. When neither matches, the panel shows an empty state.
7. **Link-graph cache** lives at `.cortex/cache/linkgraph.json`, mtime-keyed per file, schema-versioned. On activation: load cache, walk the nexus, re-parse only files whose mtime ≠ cached value, drop entries for missing files. Inbound is derived in memory and not persisted. Writes are debounced (~500ms) plus a final flush on dispose.
8. **Watchers:** GroupingService and LinkGraphService each subscribe to `vscode.workspace.onDidSaveTextDocument` plus a `**/*.md` `createFileSystemWatcher` for create/delete/rename. Each debounces independently (~150ms). No shared bus — both consumers are cheap and the simpler architecture wins.
9. **Tree element identity for multi-parent logical nodes:** each tree element carries a composite ID `<parentChainHash>::<childUriString>`. `getParent()` returns the first parent occurrence in alphabetical-by-parent-URI order so `revealInExplorer` is deterministic.
10. **No new user-facing commands in Phase 3.** Backlinks auto-tracks; no manual refresh button. A `Cortex: Rebuild Link Graph` debug command is a Phase 5 follow-up if needed.
11. **Testing:** every pure module gets Vitest coverage:
    - Glob matcher (`group` resolution, negation, self/index exclusion, multi-parent, cycle breaking).
    - Link parser (markdown links, image refs, anchor stripping, line capture, malformed input tolerance).
    - Cache (de)serialization (round-trip, version mismatch, missing-file pruning).
      VS Code-API-bound code (providers, watchers, active-file tracking) verified manually in the Extension Development Host.

---

## Stage 1 — Glob Matcher (Pure)

**Goal:** a single pure function correctly resolves a parent doc's `group` against its sibling set, applying all the §5.5 rules. No vscode imports.

### Files

```
src/extension/grouping/
├── match.ts                  # pure resolver
└── (tests in tests/extension/grouping/match.test.ts)
```

### Tasks

- Export `resolveGroup(parent: GroupCandidate, siblings: SiblingEntry[]): URI[]` where:
    - `GroupCandidate` carries `{ uri, patterns: string[] }` (the patterns come from frontmatter, already a string array).
    - `SiblingEntry` carries `{ uri, basename, isDirectory, isIndex }`.
    - Returns the matched-and-allowed sibling URIs in stable order (alphabetical by basename).
- Use `ignore()` from the `ignore` package for matching. Construct one matcher per `group` invocation, add patterns, then test each sibling's basename (with trailing `/` appended for directories so folder-only patterns work).
- Apply hard exclusions before returning: drop any sibling whose `uri === parent.uri`, drop any sibling where `isIndex === true`.
- Catch and `console.warn` on any pattern that throws when added to `ignore()`. Skip the bad pattern; keep the rest.

### Acceptance

- Unit tests cover: simple basename match, glob patterns, trailing-slash folder-only, `*.md` file-only, `!` negation, self-exclusion, index-file exclusion, empty pattern list, malformed pattern (warns, doesn't throw).
- `pnpm test` clean.

---

## Stage 2 — GroupingService

**Goal:** a host-side service that, given a folder URI, returns the logical-parent topology for its children. Handles cycles and multi-parent. All disk and frontmatter access goes through `FrontmatterService`.

### Files

```
src/extension/grouping/
├── service.ts                # GroupingService
└── (tests in tests/extension/grouping/service.test.ts)
```

### Tasks

- Export `class GroupingService` with the signature:
    ```ts
    resolve(folderUri: URI, entries: SiblingEntry[]): {
        logicalChildren: Map<URI, URI[]>;     // parentUri → ordered list of child URIs
        suppressedSiblings: Set<URI>;          // URIs to remove from the regular sibling list
        primaryParent: Map<URI, URI>;          // childUri → first parent (for revealInExplorer)
    };
    ```
- For each `SiblingEntry` that is a non-index `.md` file with a `group` frontmatter array, query `FrontmatterService` for its parsed value, then call `resolveGroup` (Stage 1).
- **Cycle breaking** — first-write-wins: walk parents in alphabetical-by-URI order. When evaluating parent P, if any candidate child C has *already* been recorded as a parent in `logicalChildren`, AND P is currently in C's matched set, drop P from C's matched set (because adding P → C would create a cycle through C → P). Remaining matches stick.
- **Suppression rule:** any URI that appears in any `logicalChildren[parent]` is added to `suppressedSiblings` so the explorer drops it from the top-level list.
- **Primary parent rule:** for each suppressed URI, `primaryParent[child]` = the alphabetically-first parent that adopts it.
- Service depends only on `FrontmatterService`. No vscode-specific tree types; the explorer adapts the result.

### Acceptance

- Unit tests cover: single parent absorbs siblings, multi-parent with shared child, cycle (A→B and B→A) resolved by alphabetical first-write, child appears under multiple parents, empty `group` array is a no-op, frontmatter without `group` is a no-op.
- Service has no `import * as vscode` (verifiable by ESLint rule or grep in test).

---

## Stage 3 — Cortex Explorer Integration

**Goal:** logical nodes render in the Cortex Explorer with correct expand/collapse, click behavior, and live updates.

### Files

```
src/extension/tree/
└── explorer.ts               # extend CortexExplorerProvider
```

### Tasks

- Inject `GroupingService` into `CortexExplorerProvider`'s constructor.
- In `getChildren(folderElement)`:
    1. Compute the regular sibling set as today (ignore-filtered, frontmatter-titled, index-file-merged).
    2. Pass the set to `GroupingService.resolve()`.
    3. Remove `suppressedSiblings` from the regular list.
    4. For each entry remaining, if it appears as a key in `logicalChildren`, mark its TreeItem as `Collapsible` regardless of whether it would otherwise be a leaf. Stash the matched child URIs on the element so its own `getChildren` returns them.
- Tree element identity: when emitting a child under a logical parent, build the element's `id` as `${parentChainHash}::${childUri.toString()}` so VS Code distinguishes the same URI under different parents. Cache parent chains keyed on the element instance.
- `getParent(element)` consults `primaryParent` for logical-child elements; for regular elements it returns the directory parent as before.
- File watcher: the existing explorer watcher already fires `_onDidChangeTreeData` on `.md` saves and FS events. Confirm it fires for frontmatter-only edits (it does — `onDidChangeTextDocument` on the source). On fire, `GroupingService` is re-queried lazily on the next `getChildren`, picking up changed `group` arrays automatically (frontmatter cache invalidates by mtime).
- Single-click on a logical-parent node still opens the parent doc in the Reader (existing default click). Expand chevron toggles independently.

### Acceptance

- A folder containing `webapp.md` (with `group: [webapp-*]`) plus `webapp-frontend.md`, `webapp-backend.md`, and `unrelated.md` renders `webapp` as expandable, with the two `webapp-*` files nested inside it. `unrelated.md` stays at the top level.
- Editing `webapp.md` to remove the `group` property and saving causes the explorer to re-flatten the tree on the next refresh tick.
- A child matched by two parents appears under both, can be expanded/clicked under each, and "Reveal in Cortex Explorer" highlights the alphabetically-first occurrence.
- A cycle (`a.md` groups `b.md`, `b.md` groups `a.md`) renders `b` under `a` and not vice versa; `a` remains a top-level sibling.
- Clicking a logical parent opens the parent doc in the Reader exactly like a regular file node.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` clean.

---

## Stage 4 — Link Parser (Pure)

**Goal:** a pure function extracts every relative markdown link and image reference from a document, with line context, ignoring code fences and inline code.

### Files

```
src/extension/linkgraph/
├── parse.ts                  # pure parser
└── (tests in tests/extension/linkgraph/parse.test.ts)
```

### Tasks

- Export `parseLinks(source: string): ParsedLink[]` returning entries shaped like:
    ```ts
    type ParsedLink = {
        kind: "link" | "image";
        href: string;          // raw, as written
        line: number;          // 1-based
        lineText: string;      // trimmed source line, truncated to 120 chars + "…"
    };
    ```
- Use `markdown-it` with a minimal config (no plugins) on the **host side** — the parser already lives in the webview, but for graph-building we need a Node-side parser. Add `markdown-it` to the extension-host bundle (it's small enough; same package as webview, separate bundle copy).
- Walk tokens; capture `link_open` and `image` tokens. For each, derive the source line from the token's `map[0]` (markdown-it gives line ranges).
- Filter out hrefs matching `^#`, `^https?://`, `^mailto:`, `^tel:`, and any non-relative scheme. Keep everything else (relative paths, with or without `./`).
- Don't try to resolve the href against a base URI here — that's the service's job (pure parser stays I/O-free).
- `lineText` is sourced from the original `source` split on `\n`, the line trimmed and truncated.

### Acceptance

- Unit tests cover: plain link, image ref, link inside list/quote/table cell, link inside fenced code block (excluded — markdown-it doesn't tokenize them as links), inline-code-wrapped link (excluded), link with anchor (`./other.md#section` kept verbatim in `href`), multiple links on one line (each captured with the same line number), malformed markdown doesn't throw.

---

## Stage 5 — LinkGraphService + Cache

**Goal:** a host-side service maintains `Map<URI, { outbound: ParsedLink[]; inbound: { source: URI; link: ParsedLink }[] }>` for every `.md` file in the active nexus, with persistent mtime-keyed cache and incremental updates.

### Files

```
src/extension/linkgraph/
├── service.ts                # LinkGraphService
├── cache.ts                  # cache (de)serialization, schema versioning
├── resolve.ts                # href → resolved URI (uses NexusService.active root)
└── (tests in tests/extension/linkgraph/{service,cache,resolve}.test.ts)
```

### Tasks

- `LinkGraphService.start(nexusRoot: URI)`:
    1. Load `.cortex/cache/linkgraph.json` if present; validate schema version. On any failure, ignore the cache and continue.
    2. Walk the nexus for `.md` files honoring `IgnoreService`.
    3. For each file: stat → if mtime matches cached value, hydrate from cache; else read + `parseLinks` + store. Drop cache entries for files that no longer exist.
    4. Build `inbound` indices in memory by reversing every outbound entry whose resolved target is itself a `.md` inside the nexus.
- `resolve(href, sourceUri, nexusRoot)` (pure helper, in `resolve.ts`): mirror the Reader's link classifier but stricter about target existence. Returns `{ kind: "internal", uri }` for in-nexus `.md` targets that exist on disk; `null` otherwise. Used to filter outbound to graph-relevant edges.
- Subscribe to `onDidSaveTextDocument` and the `**/*.md` watcher (create/delete/rename). On change, re-parse the affected file, diff outbound against cached value, update both halves of the index, schedule a cache write (~500ms debounce).
- Public API:
    - `getInbound(uri: URI): { source: URI; link: ParsedLink }[]` — returns inbound, filtered to titled-doc sources at call time (frontmatter check via `FrontmatterService`).
    - `getOutbound(uri: URI): ParsedLink[]` — raw outbound for the given file.
    - `onDidUpdate: vscode.Event<URI[]>` — fires the set of URIs whose inbound or outbound changed since the last fire (BacklinksProvider listens here).
- Cache schema:
    ```json
    {
      "version": 1,
      "entries": {
        "<relPath>": {
          "mtime": 1730000000,
          "outbound": [{ "kind": "link", "href": "./other.md", "line": 12, "lineText": "see [other](./other.md)" }]
        }
      }
    }
    ```
    Keys are forward-slash-normalized relative paths from the nexus root. On version mismatch, cache is discarded and rebuilt.
- `dispose()` flushes the pending cache write synchronously.

### Acceptance

- On a fresh nexus with N `.md` files, first activation fully scans and writes the cache. Second activation hydrates from cache without re-parsing (verifiable via a `console.time` around the build pass).
- Editing a file and saving updates both its outbound list and the inbound list of any newly-linked / unlinked targets within ~200ms.
- Deleting a file removes its outbound and prunes inbound entries from its old targets.
- Renaming a file via the OS / git removes the old entry and adds a new one (the watcher fires create+delete; service handles both).
- A file with malformed markdown doesn't poison the cache or stall the build pass.
- `pnpm test` adds coverage for cache round-trip, version mismatch, and inbound-derivation correctness.

---

## Stage 6 — Backlinks Tree View

**Goal:** a second `vscode.TreeDataProvider` registered under the Cortex sidebar container surfaces inbound links to the active document, with linking-line previews and click-to-source.

### Files

```
src/extension/backlinks/
├── provider.ts               # BacklinksProvider
└── activeFile.ts             # active-file tracker (Reader URI ∪ activeTextEditor URI)
```

### Tasks

- `package.json` — add a second `views.cortex` entry:
    ```json
    { "id": "cortex.backlinks", "name": "Backlinks", "type": "tree" }
    ```
- `ActiveFileTracker` (in `activeFile.ts`):
    - Subscribes to `ReaderProvider.onDidChangeCurrentDoc` (new event — add to `ReaderProvider` and fire from `open()`, `handleCurrentDocChanged`, and panel-dispose paths).
    - Subscribes to `vscode.window.onDidChangeActiveTextEditor` filtered to `.md` files inside the active nexus.
    - Public: `current(): URI | undefined` and `onDidChange: vscode.Event<URI | undefined>`.
    - Resolution rule: Reader URI > active editor URI. If neither is a titled doc inside the active nexus, returns `undefined`.
- `BacklinksProvider`:
    - Two-level tree:
        - **Top level** — one element per source doc that links to the active file. Label = source doc's `title` + ` (N)` where N is the number of links from that source. Clicking opens the source in the Reader.
        - **Children** — one element per `ParsedLink`. Label = `lineText` (already trimmed/truncated by the parser). Clicking opens the source in the Reader and scrolls to the linking line.
    - Listens to `LinkGraphService.onDidUpdate` and `ActiveFileTracker.onDidChange`; fires `_onDidChangeTreeData` whenever the current file's inbound list could have changed.
    - Empty state: VS Code's built-in `viewsWelcome` contribution with a single line — `"No backlinks for this file."`.
- Click-to-source-line: dispatch a custom command `cortex.backlinks.openLink` that takes `{ sourceUri, line }` and:
    1. Opens the source in the Reader (existing `cortex.tree.openInReader` behavior).
    2. Posts a new webview message `scrollToLine` after the render commits (lightweight — finds the line by scanning rendered output for the data-source-line attribute set by an updated render rule, or falls back to source-editor-only navigation if Reader can't anchor on it).
    
    For v1 simplicity, **defer the scroll-to-line behavior to the source editor** (open the underlying file in a regular editor at the line). Reader-side scroll-to-line is a Phase 4 polish item — flagged below in Known Limitations.

### Acceptance

- Opening a doc that is linked from three other docs shows three top-level entries in the Backlinks panel; expanding each reveals the linking lines.
- Clicking a top-level entry opens the source in the Reader.
- Clicking a child line entry opens the source in a regular editor positioned at the line.
- Editing a doc to add a link to the active file updates the panel within ~200ms.
- Switching the active file (via Reader navigation, switching editor tabs, or clicking another file in the explorer) refreshes the panel.
- Closing all editors / Readers leaves the panel showing the empty-state message.

---

## Stage 7 — Verification & Packaging

**Goal:** Phase 3 is shippable.

### Tasks

- Build out the smoke-test corpus in `examples/`:
    - A folder with a `group`-using doc absorbing 3+ siblings, including one folder.
    - A pair of docs that would create a cycle (verify only one direction renders).
    - A "hub" doc linked from 5+ other docs (verify backlinks panel populates correctly).
    - A doc with image refs to verify they're stored in the graph but excluded from the panel.
- Add a developer-only command `cortex.dev.dumpLinkGraph` that posts the in-memory graph to the developer console. Useful during smoke-testing; can stay shipped (no menu contribution).
- Update `README.md`: roadmap row for Phase 3 → Done; new screenshot of the Backlinks panel + a logical-node tree.
- Bump `package.json` version to `0.2.0`.
- `pnpm package` produces a clean `.vsix`. Sideload in VS Code, Cursor, and Windsurf; verify the new sidebar view appears and populates.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` all clean. Test count grew by the new pure-logic suites.

### Acceptance

- Smoke-test corpus passes manual inspection.
- `.vsix` installs cleanly and the new view shows up in all three editors.

---

## Decisions Deferred to Implementation Time

- **Token-walk vs regex for link parsing.** Plan locks markdown-it tokens for correctness around fenced code. If the host bundle bloat from markdown-it is unacceptable (it isn't expected to be — it's already in the webview bundle and is small), fall back to a minimal regex pass.
- **Cache write granularity.** v1 rewrites the entire cache file on debounce. If this becomes a perf hit on huge nexuses (>10k docs) we can move to per-shard JSON or SQLite. Don't optimize yet.
- **Reader scroll-to-line on backlink click.** Out of v1 scope (see Stage 6); v1 falls back to opening the source editor at the line. Reader-side anchor support requires the renderer to emit per-line anchors and a webview `scrollToLine` message — small but not free. Revisit if the editor-only fallback feels jarring.
- **Frontmatter `group` value normalization.** v1 expects `group` to be a YAML list of strings. A single-string value (`group: webapp-*`) is currently rejected. Coerce to single-element array later if real use motivates it.

---

## Known Limitations Carried Out of Phase 3

- **No problem-reporting surface.** Invalid `group` patterns and broken links are silent (`console.warn` only). Phase 5.
- **No drag-and-drop link rewriting.** Moving a file in the explorer breaks its inbound links. Phase 5 stretch.
- **No graph view.** The link graph is built and queryable but only the Backlinks panel surfaces it. Phase 4.
- **No Reader scroll-to-line on backlink click.** Defaults to opening the source editor (see Stage 6).
- **No "Rebuild Link Graph" command.** Cache rebuilds automatically on version mismatch or fresh activation. A debug command lands in Phase 5 if needed.
- **Settings.** `cortex.*` properties remain hard-coded; surface in Phase 5.

---

## Phase 3 Definition of Done

A user opens a nexus and:

1. Documents declaring a `group` frontmatter property render as expandable nodes in the Cortex Explorer, absorbing matching same-folder siblings (with cycles broken deterministically and multi-parent allowed). Index files are exempt both ways.
2. The Cortex sidebar contains a second tree view, **Backlinks**, that shows every doc linking to the currently-active file, with a child preview node per linking line.
3. The link graph persists across sessions in `.cortex/cache/linkgraph.json` and rebuilds incrementally on save and FS events without a noticeable hitch.
4. All three behaviors update live as the user edits, switches files, or navigates the Reader.

The pipeline is built into a runnable `.vsix` (v0.2.0) that installs into VS Code, Cursor, and Windsurf and survives a smoke-test pass on the canonical Phase 3 test corpus.
