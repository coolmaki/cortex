---
title: Phase 4 Implementation Plan
---

# Cortex — Phase 4 Implementation Plan

## Context

[`PRD.md`](../PRD.md) specifies **Cortex**, a VS Code extension that turns any workspace folder into a local-first, GitHub-compatible markdown knowledge base. Phases 1–3 ([`PHASE1.md`](PHASE1.md), [`PHASE2.md`](PHASE2.md), [`PHASE3.md`](PHASE3.md)) shipped the sidebar, Cortex Explorer, multi-root nexus discovery, GitHub-fidelity Reader, logical-node grouping, and the Backlinks panel — including the persistent `LinkGraphService` that maintains a directed link graph in `.cortex/cache/linkgraph.json`.

This document covers **Phase 4 only** (PRD §6.5, §13): the **force-directed graph view**. By the end of Phase 4, running **Cortex: Open Graph View** opens a webview tab showing every titled `.md` in the active nexus as a node and every relative link between them as a directed edge, with click-to-open, hover-to-highlight-neighbors, drag-to-reposition, pan/zoom, and a substring-match search box. The graph re-derives live from `LinkGraphService.onDidUpdate`.

What this phase **does not** include (deferred):

- **Settings surface** (Phase 5). `cortex.graph.showOrphans` and any other `cortex.*` properties remain hard-coded; promotion to `package.json#contributes.configuration` lands with the Phase 5 settings pass.
- **Canvas rendering** for very large graphs. v1 ships SVG-only. If a real nexus pushes past the SVG comfort range (~500 nodes / ~1k edges) we revisit; until then the simpler implementation wins.
- **Cluster / community detection, layout presets, exports.** Out of scope.
- **Logical-node visualization.** The `group` frontmatter property influences the Cortex Explorer only; the graph reflects link relationships exclusively (PRD §5.5).
- **Tag / type / status filtering.** Substring search on the title is the only filter in v1; structured filters can land later if real use motivates it.
- **Pinning dragged nodes.** Released drags re-enter the simulation. Pin-on-drag is a Phase 5 polish item if needed.
- **Reader scroll-to-line on backlink click.** Carried over from Phase 3's known limitations; orthogonal to the graph.

---

## Locked Decisions for Phase 4

1. **Rendering surface: SVG via D3.** No Canvas fallback in v1. Force simulation drives `<g>` transforms; edges are `<line>` with arrow markers; nodes are `<circle>` + `<text>` label. Rationale: SVG is simpler to hit-test, accessible by default, and adequate for the personal-nexus scale this product targets. Canvas is a deferred optimization.
2. **D3 surface: minimal, hand-picked modules.** `d3-force`, `d3-drag`, `d3-zoom`, `d3-selection`. No full `d3` umbrella import — keeps the webview bundle small and avoids pulling in geo / array / charting code that the graph doesn't need. Pinned via `pnpm add` per module.
3. **Node sizing:** radius = `4 + Math.sqrt(degree) * 2`, where `degree = inDegree + outDegree`. Floor at 4 px so isolated nodes are still clickable. No upper clamp; high-degree hubs grow noticeably and that's fine.
4. **Edge style:** straight directed `<line>` with a small SVG arrow marker at the head. Curved / parallel-edge offsets are out of scope; multiple links between the same pair render as overlapping lines (acceptable for v1).
5. **Force tuning (defaults; tweakable in Stage 2):** `forceLink` distance 80, `forceManyBody` strength −180, `forceCenter` at the viewport midpoint, `forceCollide` radius = node radius + 4. The simulation `alphaDecay` is left at default (0.0228) so the layout settles in ~1.5 seconds.
6. **Active-file indicator:** the active file's node renders with a 2 px ring in `--vscode-focusBorder`. No auto-pan-to-active in v1 (jumpy when the active file changes during a stable layout). A "Center on active file" toolbar button is a Phase 5 candidate.
7. **Hover highlight:** on `mouseenter` of a node, the node, its directly-connected neighbors, and the edges between them keep full opacity; everything else dims to ~0.2 opacity. `mouseleave` clears. Hover state is webview-local; no host round-trip.
8. **Click → open:** node click posts `{ type: "openNode", uri }` to the host, which dispatches `cortex.tree.openInReader`. The Reader opens (or reveals) in the active editor group; the graph tab keeps focus until the user moves it.
9. **Search box:** a single `<input type="text">` in the graph webview's sticky header. Substring match (case-insensitive) against the node label; matched nodes keep full opacity, others dim. Empty input restores all. No debounce — input is tiny and runs on the same DOM.
10. **Live updates:** the host subscribes to `LinkGraphService.onDidUpdate` and on fire serializes the current `{ nodes, edges }` and posts an `update` message. The webview re-binds the data via `simulation.nodes()` / `simulation.force("link").links()`, then `simulation.alpha(0.5).restart()` to nudge the layout. Existing node positions are preserved by joining on URI; new nodes spawn at the viewport center; removed nodes are dropped.
11. **Empty states:** the webview renders a centered message:
    - No active nexus: "No nexus is active."
    - Nexus has zero titled `.md` files: "This nexus has no titled documents."
    - Nexus has nodes but no edges: render the nodes; no special message.
12. **Activation:**
    - **Command:** `cortex.graph.open` (palette entry: **Cortex: Open Graph View**).
    - **View-title button:** an icon button on the `cortex.explorer` tree view's title bar — `$(graph)` codicon — invokes `cortex.graph.open`.
    - **No default keybinding.** `Cmd/Ctrl+Shift+G` collides with the source control view; the PRD's "if not conflicting" caveat resolves to *don't bind by default*. Users can map it themselves.
13. **One graph per nexus.** `GraphProvider.open()` reuses the existing panel if open; switching the active nexus disposes the panel (graph is per-nexus, no cross-nexus view).
14. **Cache:** the graph reads from `LinkGraphService` directly. No separate persistence — the link graph cache from Phase 3 already covers cold-start performance. Node positions are not persisted across reloads (force layout is fast; saved positions add complexity for low value).
15. **Testing:** new pure-logic modules get Vitest coverage:
    - Graph data derivation (`buildGraph(linkGraph, frontmatter)`): node/edge construction, orphan inclusion, untitled-source filtering.
    - Search filter (`filterNodes(query, nodes)`): substring match, case insensitivity, empty query semantics.
      VS Code-API-bound code (provider, message dispatch) and D3 rendering verified manually in the Extension Development Host.

---

## Stage 1 — GraphProvider + Webview Scaffold

**Goal:** running **Cortex: Open Graph View** opens a blank webview tab titled "Cortex Graph" that completes the host↔webview handshake and prints "graph webview ready" in the dev console. No rendering yet.

### Files

```
src/extension/graph/
├── provider.ts                  # GraphProvider — webview lifecycle, message routing
└── messaging.ts                 # typed host↔webview message contracts (host side)

src/webviews/graph/
├── index.html                   # mount point — referenced from provider HTML
├── main.ts                      # entry: handshake, message routing
├── messaging.ts                 # mirror of host-side contracts (webview side)
└── styles/
    └── base.css                 # placeholder; populated in Stage 2
```

### Tasks

- Define the message protocol in shared `messaging.ts` files (one host-side, one webview-side, same shape).
    - **Host → graph:** `init { mode: "normal", graph: GraphData, themeKind } | init { mode: "empty", reason: "no-nexus" | "no-docs" } | update { graph: GraphData } | themeChanged { themeKind } | activeFileChanged { uri: string | undefined }`.
    - **Graph → host:** `ready | openNode { uri: string } | reload`.
    - `GraphData` shape is a placeholder for now; final schema lands in Stage 2.
- `GraphProvider` mirrors `ReaderProvider`'s pattern: panel lifecycle, CSP-correct HTML, ready-handshake, theme watcher. Reuse `getNonce()` and `getThemeKind()` helpers.
- `vite.config.ts` learns about the new bundle entry: `src/webviews/graph/main.ts` → `out/webviews/graph.{js,css}`.
- Register `cortex.graph.open` in `src/extension/commands/index.ts`.
- Add the command to `package.json#contributes.commands` and a view-title button on `cortex.explorer`.
- Wire the provider into `src/extension/index.ts` activation; push it onto `context.subscriptions`.

### Acceptance

- Running **Cortex: Open Graph View** in the dev host opens a blank webview tab.
- The webview console logs the receipt of an `init` message (with placeholder content).
- Closing and reopening reuses or recreates the panel cleanly; switching the active nexus disposes it.
- `pnpm build`, `pnpm typecheck`, `pnpm lint` all clean.

---

## Stage 2 — Graph Derivation + Static Rendering

**Goal:** the graph webview displays nodes and edges from the active nexus, statically positioned (no force simulation yet). Nodes show the doc title; edges connect linkers to targets.

### Files

```
src/extension/graph/
├── derive.ts                    # pure: buildGraph(linkGraph, frontmatter) → GraphData

src/webviews/graph/
├── render.ts                    # SVG node/edge bind + label rendering
└── styles/
    └── base.css                 # node/edge/label/dim styling
```

### Tasks

- Define the final `GraphData` shape:
    ```ts
    type GraphNode = {
        uri: string;                // vscode.Uri.toString() — stable identity
        label: string;              // frontmatter title
        relPath: string;            // for tooltip / debugging
        inDegree: number;
        outDegree: number;
    };
    type GraphEdge = {
        sourceUri: string;
        targetUri: string;
    };
    type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };
    ```
- `buildGraph(getInbound, getOutbound, getAllUris, getTitle)` (pure, dependency-injected for testing) walks the tracked URI set, fetches title + relPath, drops untitled docs and any edge whose endpoint is untitled, and returns `GraphData` with degrees pre-computed.
- `GraphProvider` calls `buildGraph` against `LinkGraphService` + `FrontmatterService` on `init` and on `update`.
- Webview `render.ts` exports `renderGraph(svgEl, data)`: classic D3 enter/update/exit join on `nodes` (circles + text) and `edges` (lines). Initial positions: random within the viewport (force will take over in Stage 3).
- `base.css` defines node fill, edge stroke, label color — all `--vscode-*` based for theme tracking. Dim class for hover/search dimming (`opacity: 0.2; transition: opacity 120ms`).
- `vitest` tests for `buildGraph`:
    - Single doc, no edges → 1 node, 0 edges.
    - Two docs linked one-way → 2 nodes, 1 edge with correct in/out degrees.
    - Untitled source (no frontmatter title) → excluded, no edges from it.
    - Untitled target → edge dropped, source kept.
    - Orphan doc → included as a node with degree 0.

### Acceptance

- Opening the graph on the canonical Phase 3 corpus (`examples/backlinks/`) shows 6+ nodes including `hub.md` plus the 5 sources and the image doc.
- Edges visibly point from source nodes to `hub.md`.
- Light/dark theme switch updates node and edge colors live (via the existing `themeChanged` round-trip).
- `pnpm test` adds coverage for `buildGraph`.

---

## Stage 3 — Force Simulation + Pan/Zoom/Drag

**Goal:** nodes settle into a force-directed layout; the user can pan with mouse drag on background, zoom with wheel, and drag individual nodes to reposition. Layout is stable and converges in ~1.5 seconds on a 100-node graph.

### Files

```
src/webviews/graph/
├── simulation.ts                # d3-force setup, tick handler, on-data update
└── interactions.ts              # d3-zoom + d3-drag wiring
```

### Tasks

- `simulation.ts` sets up the four forces from Locked Decision #5; exports `start(svg, data)` and `restart()`.
- Tick handler updates `<line>` `x1/y1/x2/y2` and `<g>` transforms.
- `interactions.ts`:
    - `d3-zoom` on the SVG root, applied to a single `<g class="viewport">` so the simulation works in unscaled coordinates.
    - `d3-drag` on each node `<g>`. On `start`, fix the node (`fx/fy`); on `drag`, update them; on `end`, clear `fx/fy` so the node re-enters the simulation.
- Initial positions: spawn at viewport center with a small random jitter (avoids the deterministic-collapse failure mode where all nodes start at `(0, 0)`).
- Verify performance in the Extension Development Host with the cortex repo as the nexus (>20 docs, dozens of edges); should be visibly smooth at 60fps.

### Acceptance

- The graph from Stage 2 now self-organizes into a stable layout.
- Wheel-zooming and background-drag-panning work.
- Dragging a node moves it; releasing returns it to the simulation.
- Layout convergence is visually settled in <2 seconds for the cortex repo nexus.

---

## Stage 4 — Click-to-Open + Hover Highlight + Active-File Indicator

**Goal:** clicking a node opens it in the Reader; hovering highlights neighbors; the active doc is visually distinguished.

### Files

```
src/webviews/graph/
└── highlight.ts                 # hover + search dim/highlight logic
```

### Tasks

- Node click handler posts `{ type: "openNode", uri }` to the host.
- Host handles `openNode` by invoking `cortex.tree.openInReader` with `vscode.Uri.parse(uri)`.
- Hover: on `mouseenter`, compute the neighbor set (a single pass over edges) and toggle `dim` class on every non-neighbor node and edge; `mouseleave` removes all dims.
- Active-file ring:
    - Subscribe to `ActiveFileTracker.onDidChange` in `GraphProvider`; post `{ type: "activeFileChanged", uri }` on every change.
    - The webview adds an `active` CSS class to the matching node `<g>`. Styled in `base.css` with `stroke: var(--vscode-focusBorder); stroke-width: 2px;`.
- `ActiveFileTracker` already exists from Phase 3 — reuse the same instance via DI from `index.ts`.

### Acceptance

- Clicking any node opens the corresponding doc in the Reader.
- Hovering a node visibly highlights only it + its neighbors.
- Switching the active file (via Reader navigation or editor tab) updates the active-file ring within ~200ms.
- The graph and the Reader stay in sync as the user navigates.

---

## Stage 5 — Search/Filter + Live Updates

**Goal:** a search box in the webview filters visible nodes by substring match. The graph updates incrementally when files change.

### Files

```
src/webviews/graph/
├── search.ts                    # filter() — pure substring match
└── (search box rendered in main.ts)
```

### Tasks

- `<input type="text" placeholder="Search…">` in a sticky header above the SVG.
- `filterNodes(query, nodes)` (pure): returns the set of node URIs whose label contains `query` (case-insensitive). Empty query → all nodes.
- On input change, apply the `dim` class to nodes whose URI is *not* in the matched set, and to edges whose endpoints don't match.
- Live updates:
    - `GraphProvider` subscribes to `LinkGraphService.onDidUpdate` and posts `{ type: "update", graph }` on fire.
    - Webview's `update` handler diffs by URI: existing nodes keep their positions; new nodes spawn at viewport center; removed nodes are dropped.
    - Re-bind the simulation: `simulation.nodes(newNodes); simulation.force("link").links(newLinks); simulation.alpha(0.5).restart();`
- Vitest tests for `filterNodes`:
    - Empty query returns all.
    - Case-insensitive matching.
    - No-match returns empty set.

### Acceptance

- Typing in the search box dims unmatched nodes/edges live as you type.
- Editing a doc to add a new link updates the graph within ~500ms (link-graph debounce + post).
- Renaming or deleting a doc updates the graph; positions of unchanged nodes stay put.
- `pnpm test` adds coverage for `filterNodes`.

---

## Stage 6 — Verification & Packaging

**Goal:** Phase 4 is shippable as v0.3.0.

### Tasks

- Add a smoke-test corpus under `examples/graph/`:
    - A small connected component (3–5 docs in a star pattern).
    - A second disconnected component (2 docs linked to each other).
    - One orphan with no edges.
- Update `README.md`: roadmap row Phase 4 → ✅ Shipped (v0.3.0); add a "Force-directed graph" feature blurb under "What you get"; new screenshot.
- Update `docs/README.md` Phase 4 status.
- Update `docs/PRD.md`:
    - §11.1 module map: drop the `(Phase 4)` marker on `GraphProvider`; add the `derive.ts` and `webviews/graph/` paths.
    - §13 Milestones: Phase 4 → ✅ Shipped (v0.3.0).
- Bump `package.json#version` to `0.3.0`.
- `pnpm package` produces a clean `.vsix`. Sideload into VS Code, Cursor, and Windsurf; verify the new command and view-title button appear and function.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` all clean.

### Acceptance

- Smoke-test corpus passes manual inspection.
- `.vsix` installs cleanly and the graph view works in all three editors.

---

## Decisions Deferred to Implementation Time

- **Force tuning numbers.** The defaults in Locked Decision #5 are starting points; expect iteration during Stage 3 once a real-shaped graph is on screen.
- **Edge arrow size + label collision avoidance.** Cosmetic; tweak in Stage 2 against the smoke corpus.
- **Search-box placement (left vs right of header).** Cosmetic; pick whatever feels right when implementing.
- **Initial-spawn jitter radius.** Tuned by feel; if new nodes cluster too tightly with old ones, increase.

---

## Known Limitations Carried Out of Phase 4

- **No Canvas fallback.** Very large nexuses (~1k+ nodes) may stutter; not a v1 concern.
- **No node-pinning.** Drag-released nodes always re-enter the simulation. Pin-on-drag is Phase 5 if the lack annoys.
- **No saved layouts.** Each open re-runs the force simulation from scratch.
- **No structured filters.** Only substring search on the title; tag/type/status filtering can land later.
- **No graph-side affordance for logical-node grouping.** The graph reflects link relationships only; logical nodes are an explorer-only feature (PRD §5.5).
- **`cortex.graph.showOrphans` setting not exposed.** Hard-coded `true` for v1; promotion to settings UI lands with the Phase 5 settings pass.
- **No keybinding for `cortex.graph.open`.** Users wire their own.

---

## Phase 4 Definition of Done

A user opens a nexus and:

1. Running **Cortex: Open Graph View** (or clicking the new view-title button) opens a webview tab showing every titled `.md` in the nexus as a node, with directed edges for every relative link between them.
2. The graph self-organizes via force simulation; the user can pan, zoom, and drag individual nodes.
3. Hovering a node highlights its neighbors; clicking opens the doc in the Reader; the active file is visually distinguished.
4. Editing, creating, renaming, or deleting `.md` files updates the graph live.
5. The substring search box dims non-matching nodes and edges.

The pipeline is built into a runnable `.vsix` (v0.3.0) that installs into VS Code, Cursor, and Windsurf and survives a smoke-test pass on the canonical Phase 4 corpus.
