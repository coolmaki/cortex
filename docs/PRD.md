---
title: Product Requirements Document
---

# Cortex — Product Requirements Document

**Codename:** Cortex
**Version:** 2.1 (v1 of VS Code extension)
**Author:** Maki
**Date:** 2026-05-05
**Status:** Draft

---

## 1. Overview

Cortex is a VS Code extension that turns any workspace folder into a **local-first, GitHub-compatible markdown knowledgebase**. It layers a Cortex-flavored navigation experience (frontmatter-titled file tree, index-file folder merging, backlinks, interactive graph) and a **GitHub-fidelity markdown reader** on top of VS Code, while delegating editor, tabs, search, theming, and most settings to the host.

Unlike Obsidian, Cortex uses standard GitHub-flavored Markdown with relative links — every link, anchor, and image renders identically in Cortex and on github.com. There are no proprietary link formats (no `[[wiki-link]]` syntax).

**Target user:** Solo developer (the author), as a personal power-user tool. Intended for publication to the VS Code Marketplace; should also work in **Cursor** and **Windsurf** with no extra effort by sticking to stable VS Code extension APIs.

**Pivot note (May 2026):** The v1 of this product was scoped as a Tauri desktop app. It was rescoped to a VS Code extension to (a) avoid a Rust dependency in the implementation, (b) inherit a polished editor/tabs/command palette/theme system for free, and (c) ride the host's distribution channel. The spec below replaces the original.

---

## 2. Terminology

| Term                | Definition                                                                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cortex**          | The extension itself.                                                                                                                                                                                                                                                         |
| **Nexus**           | A knowledge vault — any workspace folder containing a `.cortex/` directory at its root. Equivalent to an Obsidian "vault." A nexus is designed to also be the root of a Git repository.                                                                                       |
| **Cortex View**     | Cortex's own sidebar (a custom Activity Bar container, separate from the built-in Explorer) containing the Cortex Explorer and Backlinks views.                                                                                                                               |
| **Cortex Explorer** | The frontmatter-titled, ignore-filtered, index-file-merging file tree shown inside the Cortex View.                                                                                                                                                                           |
| **Reader**          | Cortex's GitHub-fidelity markdown preview, rendered in a webview-backed editor tab.                                                                                                                                                                                           |
| **Focus Mode**      | A Cortex Explorer display mode that hides directories containing no `.md` files recursively.                                                                                                                                                                                  |
| **Index File**      | A `README.md`, `INDEX.md`, or `index.md` file that serves as the root document for its containing folder. When present, the folder node in the Cortex Explorer adopts the index file's frontmatter `title` as its display name, and clicking the folder opens the index file. |

---

## 3. Goals & Non-Goals

### 3.1 Goals

- Provide a Cortex-flavored sidebar (file tree + backlinks) inside VS Code, layered over what VS Code already does well.
- Render markdown with as close to **github.com fidelity** as practical: GFM, callouts, mermaid, math, footnotes, task lists, emoji shortcodes, syntax-highlighted code.
- Maintain full compatibility with GitHub's markdown renderer — every link, anchor, and image must work in both Cortex and on github.com without modification.
- Support a nexus that is also a code repository root, filtering intelligently to show only knowledge-relevant content.
- Surface non-obvious connections between notes via a backlinks panel and an interactive graph view.
- Ship to the VS Code Marketplace; work unmodified in Cursor and Windsurf.

### 3.2 Non-Goals (v1)

- Plugin/extension system on top of Cortex.
- Sync, cloud storage, multi-device, or collaboration features.
- Mobile / VS Code for the Web (Web is excluded because Cortex relies on Node-only APIs in the extension host; revisit later if needed).
- Editing of non-markdown files via Cortex (VS Code handles those natively).
- Wiki-link `[[syntax]]` — all links use standard markdown `[text](./path.md)`.
- Multiple nexuses **active** simultaneously — only one nexus is active at a time. In multi-root workspaces with several `.cortex/` folders, the user switches between them via the status bar (see §5.1, §6.6).
- Nested nexuses — a `.cortex/` directory inside a sub-folder of an outer nexus is **ignored**; the outer nexus governs the whole tree.
- Custom global search (the VS Code built-in workspace search is used; custom Cortex-only search is a v2 candidate).
- Replacing VS Code's built-in markdown editor (Cortex provides reading + navigation; editing happens in VS Code's normal editor).
- Auto-linked GitHub references (`#123`, `@user`) — these only make sense with a known remote and are out of scope.

---

## 4. Tech Stack

| Layer                      | Technology                                                                   |
| -------------------------- | ---------------------------------------------------------------------------- |
| **Host**                   | VS Code (and API-compatible forks: Cursor, Windsurf)                         |
| **Language**               | TypeScript (extension host + webviews)                                       |
| **Extension API surface**  | Stable APIs only — no `proposedApi` flags, so forks consume the same `.vsix` |
| **Extension host bundler** | esbuild (single `out/extension.js`)                                          |
| **Webview bundler**        | Vite (Rolldown), one bundle per webview                                      |
| **Markdown rendering**     | `markdown-it` + plugins (see §6.4)                                           |
| **Code highlighting**      | Shiki (uses VS Code TextMate grammars + themes; auto-matches user theme)     |
| **Diagrams**               | `mermaid`                                                                    |
| **Math**                   | KaTeX (`markdown-it-katex` or equivalent)                                    |
| **Graph rendering**        | D3.js force-directed simulation                                              |
| **Frontmatter parsing**    | `gray-matter` (or `js-yaml` directly)                                        |
| **Ignore parsing**         | `ignore` (npm package; honors gitignore semantics)                           |
| **Package manager**        | pnpm                                                                         |

### 4.1 Extension Host vs. Webview Boundary

- **Extension host (Node.js):** activation, tree data providers (Cortex Explorer + Backlinks), webview lifecycle, file system watching, frontmatter parsing, ignore matching, link graph construction, all commands and menus.
- **Webviews (isolated iframes):** the Reader (markdown rendering pipeline) and the Graph view. Webviews receive structured messages from the host (file content, nav events) and emit messages back (link clicks, edit-source requests, ready signals).
- All logic that touches the workspace files lives in the extension host. Webviews are pure rendering surfaces.

---

## 5. Core Concepts

### 5.1 The Nexus

A nexus is initialized by creating a `.cortex/` directory at the root of a VS Code workspace folder. Its contents:

```
.cortex/
├── ignore        # Optional; gitignore-syntax patterns applied on top of .gitignore
└── cache/        # Optional; runtime caches (link graph, etc.). Should be gitignored.
```

**No `config.json` is required.** All user-facing settings live in VS Code's settings system under the `cortex.*` namespace (see §8). The `.cortex/` directory's presence is the only signal Cortex needs to recognize a nexus.

**Activation:** Cortex activates when a workspace folder containing `.cortex/` is opened. When no nexus is detected in the active workspace, the Cortex View shows a "No nexus found" placeholder with an "Initialize Cortex Nexus" button.

**Multi-root workspaces:** Cortex enumerates every workspace folder containing a `.cortex/` directory at its root. Behavior:

- **Zero candidates:** the Cortex View shows the "No nexus found" placeholder.
- **One candidate:** it is auto-selected as the active nexus.
- **Multiple candidates:** the most recently active is restored from workspace state if still present; otherwise the first (in workspace order) is selected. The user switches between them via the status bar item (§6.6) or the **Cortex: Switch Nexus** command (§6.8), which opens a quick-pick listing all candidates.

The active nexus selection persists in `vscode.ExtensionContext.workspaceState` so it survives reloads. Only one nexus is active at a time — the Cortex Explorer, Backlinks, Reader navigation, and Graph all operate against the active nexus only. Switching the nexus refreshes all Cortex views.

Workspace folder additions/removals and `.cortex/` directory creation/deletion update the candidate set live.

**Nested nexuses:** if a sub-folder under the active nexus also contains a `.cortex/` directory, the inner `.cortex/` is **ignored**. The outer nexus governs the whole tree. (Override semantics are an explicit non-goal for v1; revisit if a real use case appears.)

**`.cortex/ignore` format:** standard `.gitignore` syntax. Patterns here are applied **in addition to** the workspace's `.gitignore` (if present). Example:

```
# Hide build artifacts and dependencies
dist/
node_modules/
*.log

# Hide non-doc directories
src/
tests/
```

### 5.2 GitHub-Compatible Markdown

Cortex enforces standard GitHub-flavored Markdown (GFM) linking conventions. This is a core architectural constraint.

**Supported link types:**

| Type               | Syntax                           | Example                             |
| ------------------ | -------------------------------- | ----------------------------------- |
| Relative file link | `[text](./path/to/file.md)`      | `[API Docs](./docs/api.md)`         |
| Anchor link        | `[text](./file.md#heading-slug)` | `[Setup](./README.md#installation)` |
| Relative image     | `![alt](./path/to/image.png)`    | `![Diagram](./assets/arch.png)`     |
| External link      | `[text](https://...)`            | `[GitHub](https://github.com)`      |

**Rules:**

- All internal links use relative paths from the current file.
- Heading anchors use GitHub's slugification algorithm (lowercase, hyphens for spaces, strip special chars).
- No `[[wiki-link]]` syntax.
- Cortex must resolve and navigate all of the above link types when clicked in the Reader.

### 5.3 Frontmatter

Every `.md` file in the nexus **must** contain YAML frontmatter with at least a `title` property to be recognized by Cortex's own views. Files without a valid `title` are ignored — they do not appear in the Cortex Explorer, the graph, the backlinks panel, or any Cortex-provided affordances.

> **Note:** This rule applies only to **Cortex's own custom views**. The built-in VS Code Explorer continues to show all files normally — Cortex cannot (and does not try to) hide files from it.

**Minimum valid frontmatter:**

```yaml
---
title: My Document Title
---
```

**Rationale for the title requirement:** Repositories commonly contain many files with identical filenames (e.g., `README.md` at multiple directory levels). Using the frontmatter `title` as the canonical display name ensures every node in the Cortex Explorer and graph is uniquely identifiable.

**Recognized frontmatter properties:**

| Property | Type       | Used by             | Description                                                                                            |
| -------- | ---------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `title`  | `string`   | Explorer, Reader, Graph, Backlinks | Display name; required for Cortex to surface the file at all (§5.3).                       |
| `tags`   | `string[]` | Reader (metadata strip) | Free-form tags, rendered as `#tag` chips above the document body (§6.4).                           |
| `type`   | `string`   | Reader (metadata strip) | Document type (e.g. `note`, `task`); rendered as a filled badge. No validation in v1 (§6.4).       |
| `status` | `string`   | Reader (metadata strip) | Document status (e.g. `draft`, `done`); rendered as a filled badge. No validation in v1 (§6.4).    |
| `group`  | `string[]` | Cortex Explorer     | List of glob patterns naming sibling files/folders to attach as logical children (§5.5).               |

Unknown properties are preserved by `gray-matter` but ignored by Cortex.

**Where the title is used:**

- Cortex Explorer node label (instead of the filename).
- Graph view node label.
- Reader tab title.
- Backlinks panel references.

### 5.4 Index Files (Folder Root Documents)

Certain specially-named files act as the **root document** for their containing folder. When an index file is present in a folder:

- The file does **not** appear as a separate child entry in the Cortex Explorer — it merges with the folder node.
- The folder node displays the index file's frontmatter `title` (instead of the directory name).
- Clicking the folder node opens the index file in the Reader.
- The folder remains expandable to reveal its other children.

**Index file priority (first match wins):**

1. `README.md`
2. `INDEX.md`
3. `index.md`

**Folders without an index file** display using the directory name as their label and behave as standard expandable tree nodes with no associated document.

### 5.5 Logical Nodes

A document can declare a **`group`** property in its frontmatter to logically nest matching siblings underneath itself in the Cortex Explorer. This is a presentation-only feature: it changes only how the tree is drawn — the on-disk layout, link graph, backlinks, and focus-mode evaluation are unaffected.

**Frontmatter shape:**

```yaml
---
title: Webapp
group:
  - webapp-*
  - webapp/
  - "!webapp-archived-*"
---
```

`group` is a list of patterns matched against entries in the **same parent folder** as the declaring document. Patterns use **gitignore-style** globs — the same syntax as `.cortex/ignore`:

| Pattern        | Meaning                                                       |
| -------------- | ------------------------------------------------------------- |
| `foo`          | Matches a file or folder named `foo`.                         |
| `webapp-*`     | Matches files or folders whose basename starts with `webapp-`. |
| `webapp/`      | Trailing slash → folder only.                                 |
| `*.md`         | File only (folders rarely end in `.md`).                      |
| `!pattern`     | Negation — excludes a previously matched entry.               |

**Resolution rules:**

1. **Direct siblings only.** Patterns match entries in the same folder as the declaring document. Path separators in patterns are not supported (the feature does not reach into subfolders or across the nexus).
2. **Self and index files are never matched.** The declaring document itself, and any sibling that is the folder's index file (`README.md`/`INDEX.md`/`index.md`), are excluded from the candidate set even if a pattern would match them.
3. **`group` on an index file is ignored.** An index file already represents its folder; declaring a group on it would be redundant. Place the property on a regular sibling instead, or — for cross-folder logical groupings — wait for a future feature.
4. **Multi-parent is allowed.** If a sibling matches the `group` of multiple peers, it appears as a child under each of them. The same URI can be a tree element multiple times. **Reveal-in-Cortex-Explorer** disambiguates by selecting the first occurrence in alphabetical-by-parent order.
5. **A grouped child does not appear at the top level.** Once a sibling is matched by at least one peer's group, it is removed from the regular sibling list — otherwise it would render both at the top level and under each parent.
6. **Cycles are broken by first-write-wins.** If A's group matches B, and B's group also matches A, B becomes a child of A; B's claim on A is silently dropped (a cycle would make the tree non-renderable). Order is determined by alphabetical comparison of parent paths so the resolution is deterministic.

**Tree behavior:**

- A document with one or more matched children renders as an **expandable** node in the Cortex Explorer (regardless of whether it would otherwise be a leaf).
- Single-click still opens the declaring document in the Reader (existing behavior preserved).
- Children of a logical node retain all their normal behavior: a child folder still merges with its own index file, child documents still show their `title`, and so on.
- Changes to the `group` property (or to the existence of matching siblings) re-render the affected branch on the next file-watcher tick.

**What logical nodes are not:**

- They do not affect the link graph, backlinks panel, or graph view (Phase 3) — those operate on actual link relationships.
- They do not affect focus mode (§6.2), which still evaluates real folder contents.
- They are not a tagging system. Tags exist separately as a frontmatter property (§5.3) and surface only in the Reader's metadata strip; they do not influence the tree.

---

## 6. User Interface

Cortex contributes a custom **Activity Bar container** (its own icon in the vertical strip on the far left), which opens a sidebar containing two tree views: **Cortex Explorer** and **Backlinks**. The Reader and Graph open as **webview-backed editor tabs** in the main editor group.

```
┌──────────────────────────────────────────────────────────────────┐
│ VS Code Title Bar                                                │
├──┬────────────────┬──────────────────────────────────────────────┤
│  │                │ Tab Bar (built-in)                           │
│AB|── Cortex       ├──────────────────────────────────────────────┤
│  │   View         │                                              │
│  │  ┌──────────┐  │                                              │
│  │  │ Explorer │  │     Active editor or Reader webview tab      │
│  │  ├──────────┤  │                                              │
│  │  │ Backlinks│  │                                              │
│  │  └──────────┘  │                                              │
│  │                │                                              │
├──┴────────────────┴──────────────────────────────────────────────┤
│ Status Bar (built-in) — Cortex contributes a nexus indicator     │
└──────────────────────────────────────────────────────────────────┘
```

(`AB` = Activity Bar)

### 6.1 Activity Bar Container

- A single Cortex icon is contributed to the Activity Bar.
- Clicking it reveals the Cortex sidebar containing the Explorer and Backlinks tree views (collapsible sections, native VS Code behavior).
- Icon: monochrome SVG in `media/`. Final icon TBD; placeholder during development.

### 6.2 Cortex Explorer (Tree View)

**Core behavior:**

- Displays a nested folder tree of the active nexus.
- Shows only `.md` files that have valid frontmatter with a `title` property; all others are filtered out.
- File nodes display the frontmatter `title`, not the filename.
- Folders with an index file (`README.md` > `INDEX.md` > `index.md`) display the index file's `title` as the folder label; clicking the folder opens the index file in the Reader. The index file is not shown as a separate child.
- Folders without an index file display the directory name as their label.
- Respects `.gitignore` + `.cortex/ignore` — matched paths are never displayed.
- Honors **logical nodes** (§5.5): documents declaring a `group` property in frontmatter become expandable nodes containing the matched siblings as children, removing those siblings from the top-level list. The same sibling may appear under multiple parents.

**Default click behavior:**

- **Single-click on a file node:** open the file in the **Reader** (read mode). This is the default Cortex experience.
- **Single-click on a folder node:** if it has an index file, open the index file in the Reader. If not, expand/collapse.
- **Right-click → context menu:**
    - **Open Source** — open the underlying `.md` file in a normal VS Code editor tab for editing.
    - Rename
    - Delete
    - New File (see §6.7)
    - New Folder
    - Reveal in Explorer (built-in VS Code Explorer)
    - Reveal in Finder/OS Explorer
    - Copy Relative Path

**Focus Mode (toggle):**

- When enabled, recursively hides any directory that contains zero `title`-frontmatter `.md` files within it.
- Toggled via a tree-view title bar button and a command (`cortex.tree.toggleFocusMode`).
- Persisted as a workspace setting (`cortex.tree.focusMode`).

**Other behaviors:**

- Active file is highlighted in the tree (mirroring whatever Reader/Editor tab is focused, when that file is in the nexus).
- Drag-and-drop for moving files: stretch goal for v1; if implemented, must update relative links in affected files.

### 6.3 Backlinks (Tree View)

A second tree view in the Cortex sidebar, sitting under the Explorer.

- Lists all `.md` files in the nexus that contain a relative link pointing to the **active file** (the file currently focused in either the Reader or the source editor).
- Each entry shows: the linker's frontmatter `title`, with the linking line's text as a child/preview node.
- Clicking an entry opens the source file in the Reader and scrolls to the linking line.
- Refreshes on link-graph updates (which are triggered by save and by file-system events).
- Empty state: "No backlinks for this file."

### 6.4 The Reader (Webview Editor Tab)

The Reader is Cortex's GitHub-fidelity markdown preview. It opens as a **webview-backed editor tab** (similar to how VS Code's built-in markdown preview opens a new tab). It is **not** a side-by-side toggle on the source editor — it is its own tab in the editor group.

**Opening the Reader:**

- Single-click a file in the Cortex Explorer (default).
- Command: **Cortex: Open Reader for Active File** (works on any `.md` open in an editor).
- Editor toolbar button on `.md` files: "Open Cortex Reader."

**Live updates:** while the Reader tab is open, edits made in the source editor (any editor showing the same file) update the Reader live, debounced ~150ms.

**Reader title bar:**

- The tab title is the frontmatter `title`.

**Sticky header (toolbar + metadata strip):**

The Reader's top region is pinned to the viewport so it remains visible while the body scrolls. It is rendered as a single `.sticky-header` block containing two rows:

1. **Toolbar** — Back, Forward, Reload, Edit Source. Back/Forward drive the in-Reader history (mini-browser model, see *Internal link clicks* below). Edit Source opens the underlying file in a normal editor tab.
2. **Metadata strip** — renders `tags`, `type`, and `status` from frontmatter when any are present. `tags` render as `#tag` chips; `type` and `status` render as filled badges. Plain neutral colors only — per-type color/icon mapping and `type` validation are deferred (Phase 2.5). The strip is omitted entirely when none of the three properties are set.

**Rendering pipeline (in webview):**

1. `markdown-it` configured in GFM-strict mode.
2. Plugins:
    - GFM tables, task lists, strikethrough, autolinks (built into markdown-it presets / `markdown-it-task-lists`).
    - **Callouts** (`> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]`) — custom plugin or `markdown-it-github-alerts`.
    - **Mermaid** — fenced ` ```mermaid ` blocks render via the `mermaid` library after the main parse.
    - **Math** — `$inline$` and `$$display$$` via KaTeX.
    - **Footnotes** — `markdown-it-footnote`.
    - **Emoji shortcodes** (`:smile:` → 😄) — `markdown-it-emoji`.
3. **Code highlighting:** Shiki, configured to match the user's active VS Code theme.
4. **Sanitization:** the rendered HTML is rendered inside the webview's isolated iframe; CSP forbids inline scripts except those bundled by Cortex. Image `src`s for relative paths are rewritten to `vscode-webview://...` URIs.
5. **Styling:** GitHub-styled CSS (based on `github-markdown-css` or hand-curated equivalent); a dark variant; switches with the host theme.

**Internal link clicks:** clicking `[text](./other.md)` inside the Reader **navigates the Reader webview** to `other.md` (mini-browser behavior). The webview maintains a back/forward history with a small toolbar (back, forward, reload). External `https?://` links open in the system browser via VS Code's `env.openExternal`.

**Anchor links:** `[text](./file.md#heading-slug)` navigates to `file.md` and scrolls to the matching heading. Same-page anchors (`#heading`) just scroll.

**Image rendering:** relative paths resolve against the file being rendered; Cortex sets the webview's `localResourceRoots` to the nexus root so images load.

**Heading anchors:** Cortex slugifies headings using GitHub's algorithm (lowercase, punctuation stripped, whitespace → `-`, duplicates suffixed `-1`/`-2`/...) so in-document `[text](#heading)` and cross-document `[text](./other.md#heading)` links resolve identically to github.com.

**Soft size limit:** documents over **500 KB** of raw bytes do not render through the full pipeline by default. Instead, the Reader shows a notice plus the first 50 KB as plain text, with a **Render anyway** button that bypasses the limit for that document. Threshold is hard-coded in v1; promoted to `cortex.reader.softSizeLimit` in a later phase.

**No editing in the Reader.** All editing happens in the source editor (VS Code's built-in).

### 6.5 The Graph View (Webview Editor Tab)

A force-directed graph showing the connection topology of the nexus, rendered as a webview tab.

- **Nodes:** each `.md` file with valid frontmatter `title`. Label = title. Node radius scales with `inDegree + outDegree`.
- **Edges:** each relative link between files is a directed edge.
- **Interactions:** pan/zoom, click a node to open in Reader, hover to highlight neighbors, drag to rearrange, search/filter.
- **Rendering:** D3.js force simulation rendered to `<canvas>` (preferred for >200 nodes) or SVG.
- **Access:** command **Cortex: Open Graph View** (default keybinding `Ctrl/Cmd+Shift+G` if not conflicting), tree-view title bar button.

### 6.6 Status Bar

Cortex contributes one status bar item (left side, low priority):

- **Text:**
    - `$(book) Cortex: <nexus folder name>` when a nexus is active.
    - `$(book) Cortex: no nexus` when none is detected.
- **Tooltip:**
    - With a single candidate: "Open Cortex View."
    - With multiple candidates: "Switch active nexus (N available)."
- **Click action:**
    - If multiple workspace folders contain `.cortex/`: invokes **Cortex: Switch Nexus** (opens a quick-pick of candidates with the active one marked).
    - Otherwise: opens / reveals the Cortex View.

(All other status info — cursor position, encoding, etc. — is left to VS Code.)

### 6.7 New File / New Folder UX

When the user invokes **New File** (right-click on a folder in the Cortex Explorer):

1. Cortex prompts (input box) for the **title**.
2. Cortex prompts (input box) for the **filename** (defaults to a kebab-cased version of the title, e.g. "My Note" → `my-note.md`).
3. The new file is created with the frontmatter scaffold:

```markdown
---
title: My Note
---
```

4. The Reader opens for the new file. (The user can switch to "Edit Source" immediately.)

**New Folder** is plain — just creates an empty directory. Folders only become meaningful in Cortex once they contain a titled `.md` (or an index file).

### 6.8 Command Palette Contributions

Cortex contributes the following commands (all prefixed `Cortex:`):

- **Initialize Cortex Nexus** — creates `.cortex/` in a chosen workspace folder. If multiple folders are open and none have `.cortex/`, prompts which to initialize.
- **Switch Nexus** — opens a quick-pick of all workspace folders containing `.cortex/`; selecting one makes it the active nexus. Hidden when fewer than two candidates exist.
- **Open Reader for Active File**
- **Open Source for Active File** (when the Reader is focused)
- **Open Graph View**
- **Reveal Active File in Cortex Explorer**
- **Toggle Focus Mode**
- **Refresh Cortex Explorer**
- **Rebuild Link Graph**

(VS Code's built-in palette and quick-open already cover file search, command search, and most navigation. Cortex does not add a duplicate.)

---

## 7. Features

### 7.1 Backlinks

- Built by parsing every `.md` file in the nexus on activation, extracting all relative links (markdown link syntax + image references).
- Stored as an in-memory directed graph: `Map<filePath, { outbound: Set<filePath>, inbound: Set<filePath> }>`.
- Optionally serialized to `.cortex/cache/linkgraph.json` on dispose for fast subsequent startup; invalidated by file-mtime checks.
- Updated incrementally on file save and file-system events (create/delete/rename).
- Surfaced via the Backlinks tree view (§6.3).

### 7.2 Search (v1: Built-in)

For v1, Cortex relies on **VS Code's built-in workspace search** (`Ctrl/Cmd+Shift+F`). It already supports regex, case sensitivity, whole-word matching, and respects `.gitignore`.

A future v2 may add a Cortex-specific search panel scoped to titled `.md` files only, with frontmatter-aware ranking. Out of scope for v1 — flagged here so the architecture leaves room.

### 7.3 Theming

- All UI chrome (tree views, status bar) inherits VS Code's theme automatically.
- The Reader webview observes the active VS Code theme via `vscode.window.activeColorTheme` and switches its CSS class accordingly.
- The Reader's Shiki instance switches between a light theme and a dark theme keyed off the host theme kind (`Light` / `Dark` / `HighContrast` / `HighContrastLight`).
- A user setting `cortex.reader.theme` (`"auto" | "light" | "dark"`) can override the host follow-along.

---

## 8. Configuration

All user-facing settings live in VS Code's settings system under the `cortex.*` namespace. Workspace-shared settings can be committed in `.vscode/settings.json` per VS Code convention.

| Setting                         | Type                          | Default  | Description                                                              |
| ------------------------------- | ----------------------------- | -------- | ------------------------------------------------------------------------ |
| `cortex.tree.focusMode`         | `boolean`                     | `false`  | Hide directories with no titled `.md` descendants.                       |
| `cortex.reader.theme`           | `"auto" \| "light" \| "dark"` | `"auto"` | Override the Reader's theme follow-along.                                |
| `cortex.reader.fontSize`        | `number`                      | `14`     | Reader body font size in px.                                             |
| `cortex.reader.showLineNumbers` | `boolean`                     | `false`  | Show line numbers next to rendered headings (v2 candidate; default off). |
| `cortex.graph.showOrphans`      | `boolean`                     | `true`   | Include nodes with no in/out edges in the graph view.                    |

The nexus itself is configured via files in `.cortex/`:

- `.cortex/ignore` (optional) — gitignore-syntax patterns layered on top of the workspace's `.gitignore`.

No `.cortex/config.json` exists in v1.

---

## 9. Keyboard Shortcuts (Default)

Where possible, Cortex defers to VS Code defaults. New bindings:

| Action                                | macOS                    | Windows/Linux             | Command ID                    |
| ------------------------------------- | ------------------------ | ------------------------- | ----------------------------- |
| Open Reader for Active File           | `Cmd+Shift+V` (override) | `Ctrl+Shift+V` (override) | `cortex.reader.open`          |
| Open Graph View                       | `Cmd+Shift+G`            | `Ctrl+Shift+G`            | `cortex.graph.open`           |
| Toggle Focus Mode                     | `Cmd+Alt+F`              | `Ctrl+Alt+F`              | `cortex.tree.toggleFocusMode` |
| Reveal Active File in Cortex Explorer | `Cmd+Alt+R`              | `Ctrl+Alt+R`              | `cortex.tree.revealActive`    |

> **Note on `Cmd+Shift+V`:** this conflicts with VS Code's built-in "Open Markdown Preview" command. Cortex overrides it for `.md` files when the extension is active. If the user prefers the built-in preview, the binding is removable in their `keybindings.json`. (This is the most-used reader command; the conflict cost is intentional.)

All bindings are user-overrideable through VS Code's keybinding UI.

---

## 10. File System Behavior

### 10.1 File Watching

Cortex uses VS Code's `workspace.createFileSystemWatcher` with the glob `**/*.md` against the active nexus root. Events trigger:

- **Create / Delete:** refresh Cortex Explorer node, update link graph, refresh backlinks for affected targets.
- **Change:** if the file is currently rendered in a Reader tab, re-render. Re-parse frontmatter; if `title` changed, refresh the tree label.

`.cortex/ignore` and `.gitignore` are also watched; on change, the Cortex Explorer re-filters from scratch.

Events are debounced (~100ms) to absorb bulk operations like `git checkout`.

### 10.2 Ignore System

File visibility in the Cortex Explorer (and inclusion in the link graph) is determined by a two-layer filter applied in order:

1. **`.gitignore`** at the nexus root (and any nested `.gitignore` files, per gitignore semantics).
2. **`.cortex/ignore`** — additional patterns layered on top.

Both layers are evaluated by the `ignore` npm package (which implements gitignore semantics). On change to either file, the Cortex Explorer rebuilds its visible set.

### 10.3 Focus Mode (Supplemental Filter)

Applied **after** the ignore system, focus mode hides any directory node whose recursive descendants contain zero `title`-frontmatter `.md` files.

```
function shouldShowDirectory(dir):
  for each child in dir (already ignore-filtered):
    if child is a .md file with valid title frontmatter:
      return true
    if child is a directory and shouldShowDirectory(child):
      return true
  return false
```

---

## 11. Architecture

### 11.1 Module Map

```
Extension Host (Node.js) — bundled to out/extension.js
├── activate / deactivate (src/extension/index.ts)
│   ├── Detect nexuses (workspace folders containing .cortex/).
│   └── Wire services, providers, and command registrations.
├── Tree Data Providers
│   ├── CortexExplorerProvider  ── implements vscode.TreeDataProvider
│   ├── BacklinksProvider        ── (Phase 3)
│   └── GroupingService          ── (Phase 3) resolves frontmatter `group` into the
│                                    explorer's child-of relationships
├── Webview Providers
│   ├── ReaderProvider          ── webview lifecycle, source watchers,
│   │                              live-render debounce, link-click dispatch
│   └── GraphProvider           ── (Phase 3)
├── Services
│   ├── NexusService            ── nexus discovery, switching, .cortex/ init
│   ├── FrontmatterService      ── parse + mtime-cache frontmatter; expose title/etc.
│   ├── IgnoreService           ── .gitignore + .cortex/ignore matching
│   └── LinkGraphService        ── (Phase 3)
├── Commands  ── thin shells dispatching to services / providers
└── Messaging ── postMessage protocol with webviews
                  (typed contracts in src/extension/reader/messaging.ts)

Webviews (sandboxed iframes) — one Vite bundle per webview
└── reader/
    ├── main.ts        ── handshake, message routing, history wiring
    ├── render.ts      ── markdown-it pipeline + heading slugifier
    ├── highlight.ts   ── Shiki (JS regex engine) + theme switching
    ├── math.ts        ── KaTeX (lazy)
    ├── mermaid.ts     ── Mermaid (lazy) + generation-counter cancellation
    ├── metadata.ts    ── frontmatter → strip HTML
    ├── nav.ts         ── HistoryStack with cached HTML
    ├── toolbar.ts     ── Back / Forward / Reload / Edit Source (Lucide SVGs)
    ├── messaging.ts   ── typed message contracts (mirror of host side)
    └── styles/        ── github-markdown-css overlay + per-region styles
```

### 11.2 Webview Message Protocol

**Host → Reader:**

| Type            | Payload                                                                              | Purpose                                                                          |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `init`          | `mode: "normal" \| "oversized"`; in normal mode: `content`, `frontmatter`, `baseUri`, `fileUri`, `themeKind`; in oversized: `preview`, `sizeBytes` | First render after webview mount, or after file switch. |
| `update`        | `content`, `frontmatter`, `baseUri`, `fileUri`                                        | Debounced re-render of the currently-open document.                              |
| `navigateTo`    | `content`, `frontmatter`, `baseUri`, `fileUri`, `anchor?`                              | Host-initiated navigation (internal link click). Webview pushes onto its history. |
| `themeChanged`  | `themeKind`                                                                          | Theme switched in VS Code; webview re-applies theme + re-renders code blocks.    |

**Reader → Host:**

| Type                | Payload                       | Purpose                                                                     |
| ------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `ready`             | —                             | Webview is mounted; host responds with `init`.                              |
| `openSource`        | —                             | User clicked Edit Source.                                                   |
| `linkClicked`       | `href`                        | Anchor click; host classifies and either navigates internally, opens externally, or opens a file outside the nexus. |
| `currentDocChanged` | `fileUri`                     | Webview navigated via Back/Forward to a different file; host updates the tab title and re-attaches watchers. |
| `reload`            | —                             | User clicked Reload; host resends `init` for the current document.          |
| `forceRender`       | —                             | User clicked "Render anyway" in the oversized notice; host resends `init` bypassing the size limit. |

**Graph (Phase 3):** analogous; `init` carries `{nodes, edges}`; `nodeClicked` opens the file in the Reader.

### 11.3 State Management

The extension host is the source of truth. No frontend state library is needed — webviews are stateless renderers driven by host messages. Caches (frontmatter, link graph) are plain `Map`s in the host process.

---

## 12. Project Structure

The codebase is split along the bundle boundary. **`src/extension/` and `src/webviews/` are bundled separately and never import each other** (see `.claude/rules/`).

```
cortex/
├── src/
│   ├── extension/                # Extension host (Node) — bundled to out/extension.js by esbuild
│   │   ├── index.ts              # activate() / deactivate(); wires services and providers
│   │   ├── nexus/                # NexusService — discovery, switching, .cortex/ initialization
│   │   ├── frontmatter/          # FrontmatterService — parse + cache YAML, mtime-keyed
│   │   ├── ignore/               # IgnoreService — .gitignore + .cortex/ignore matching
│   │   ├── tree/                 # CortexExplorerProvider — TreeDataProvider + index merging
│   │   ├── reader/
│   │   │   ├── provider.ts       # ReaderProvider — webview lifecycle, watchers, debounce
│   │   │   ├── messaging.ts      # typed host↔webview message contracts (host side)
│   │   │   ├── classify.ts       # pure link classifier (anchor/external/internal/outside-nexus)
│   │   │   └── links.ts          # vscode.Uri wrapper around classify.ts
│   │   └── commands/             # command registrations — thin shells over services/providers
│   └── webviews/                 # Sandboxed iframes — one Vite bundle per webview
│       └── reader/
│           ├── index.html        # mount point + CSP (production HTML lives in provider.ts)
│           ├── main.ts           # entry: handshake, message routing, history wiring
│           ├── render.ts         # markdown-it instance + plugins + heading slugifier
│           ├── highlight.ts      # Shiki (JS regex engine) — github-light/dark themes
│           ├── math.ts           # KaTeX (lazy-loaded)
│           ├── mermaid.ts        # Mermaid (lazy-loaded), generation-counter cancellation
│           ├── metadata.ts       # frontmatter → strip HTML
│           ├── nav.ts            # HistoryStack with cached HTML for back/forward
│           ├── toolbar.ts        # Back/Forward/Reload/Edit Source (Lucide SVGs)
│           ├── messaging.ts      # typed host↔webview message contracts (webview side)
│           └── styles/           # base.css (github-markdown-css overlay) + per-region styles
├── tests/
│   └── extension/                # Vitest unit tests, mirroring src/extension/
├── examples/                     # Smoke-test markdown documents for manual QA
├── assets/                       # Activity Bar icon (SVG), marketplace icon (PNG)
├── docs/
│   ├── PRD.md                    # this file
│   └── plan/
│       ├── PHASE1.md
│       └── PHASE2.md
├── .claude/rules/                # Path-scoped conventions for extension/webviews/typescript
├── package.json                  # extension manifest
├── tsconfig.json                 # extension host (CJS, Node target)
├── tsconfig.webviews.json        # webviews (ESM, browser target)
├── esbuild.config.mjs            # bundles src/extension → out/extension.js
├── vite.config.ts                # bundles src/webviews/<name> → out/webviews/<name>.{js,css}
├── .vscodeignore
├── .gitignore
└── README.md
```

The `@/` path alias maps to `src/` everywhere (TS, esbuild, Vite, Vitest). Use it for cross-directory imports within `src/`; same-directory imports stay relative.

---

## 13. Milestones

### Phase 1 — Scaffold & Core Cortex View ✅ Shipped

- VS Code extension scaffold (TS, esbuild for host, Vite for webviews, pnpm).
- Activity Bar container + Cortex View shell.
- NexusService (detect `.cortex/`, "Initialize Nexus" command, multi-root switching).
- FrontmatterService (parse YAML, extract `title`, mtime-keyed cache).
- IgnoreService (`.gitignore` + `.cortex/ignore`).
- CortexExplorerProvider — file tree with title labels, index file folder merging.
- Single-click → opens active file in a placeholder Reader webview (no rendering yet).
- "Open Source" right-click action.

### Phase 2 — The Reader ✅ Shipped (v0.1.0)

- Reader webview shell + host↔webview messaging protocol.
- markdown-it pipeline: GFM tables, task lists, strikethrough, autolinks, footnotes, emoji shortcodes, GitHub callouts.
- Shiki code highlighting (`github-light` / `github-dark`) with host-theme follow-along.
- KaTeX math (lazy-loaded).
- Mermaid diagrams (lazy-loaded, with generation-counter cancellation on rapid re-renders).
- Image resolution against the document's directory; CSP-correct `vscode-webview:` URIs.
- GitHub-style heading anchors; in-document and cross-document `#heading` links resolve.
- Internal link navigation (mini-browser with back/forward + cached HTML).
- Sticky-header toolbar (Back / Forward / Reload / Edit Source — Lucide icons) and metadata strip (`tags` / `type` / `status`).
- Live re-render on source edits (~150ms debounce, scroll preserved).
- Soft 500 KB size limit with "Render anyway" override.

### Phase 3 — Logical Nodes & Backlinks (next)

- **GroupingService** + Cortex Explorer integration for `group` frontmatter (§5.5): glob-matching siblings, multi-parent attachment, cycle breaking, live updates on watcher events.
- **LinkGraphService**: parse all `.md` in the nexus, build a directed link graph. Cache to `.cortex/cache/linkgraph.json`; invalidate by mtime mismatch. Incremental updates on save / FS events.
- **BacklinksProvider** — second tree view in the Cortex sidebar; surfaces docs that link to the active file, with linking-line previews.

### Phase 4 — Graph View

- **Graph webview**: D3 force simulation rendered to canvas, click-to-open, hover highlight, pan/zoom, search/filter.
- **Cortex: Open Graph View** command + tree-title-bar button.
- Driven off the same `LinkGraphService` produced in Phase 3.

### Phase 5 — Polish & Publish

- Focus Mode toggle in Cortex Explorer.
- New File / New Folder context menu actions with frontmatter scaffold.
- Status bar item.
- Settings (`cortex.*`) implementation + `package.json` `contributes.configuration` (including `cortex.reader.softSizeLimit` promotion).
- Reveal Active File command.
- Activity Bar icon finalization.
- README, marketplace metadata (publisher, display name, icon, gallery banner — TBD).
- Smoke-test in Cursor and Windsurf.
- Initial Marketplace publish.

---

## 14. Resolved Design Decisions

| #   | Decision                           | Resolution                                                                                                                                                                                                          |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Host platform                      | VS Code extension (was: Tauri desktop app).                                                                                                                                                                         |
| 2   | Forks                              | Cursor + Windsurf supported via stable APIs; no fork-specific code.                                                                                                                                                 |
| 3   | Multi-nexus support                | One nexus active at a time. In multi-root workspaces with multiple `.cortex/` folders, the user switches via the status bar quick-pick or `Cortex: Switch Nexus`. The active selection persists in workspace state. |
| 4   | Nested nexuses                     | Inner `.cortex/` ignored; outer governs.                                                                                                                                                                            |
| 5   | Sidebar location                   | Cortex's own Activity Bar container, not a section in the built-in Explorer.                                                                                                                                        |
| 6   | Tree default click                 | Opens the file in the Reader (read mode). Source editing via right-click → "Open Source."                                                                                                                           |
| 7   | Reader presentation                | Opens as its own webview-backed editor tab (mirrors built-in markdown preview). Not a side-by-side toggle on the source editor.                                                                                     |
| 8   | Reader live updates                | Yes, debounced ~150ms when the source is edited.                                                                                                                                                                    |
| 9   | Internal link navigation in Reader | Navigates within the Reader (mini-browser with back/forward). May reconsider in v2 based on lived experience.                                                                                                       |
| 10  | Search                             | VS Code built-in workspace search for v1. Custom Cortex search is a v2 candidate.                                                                                                                                   |
| 11  | Configuration                      | VS Code settings (`cortex.*`) for prefs; `.cortex/ignore` for nexus-shared rules. No `.cortex/config.json`.                                                                                                         |
| 12  | Markdown library                   | `markdown-it` + plugins.                                                                                                                                                                                            |
| 13  | Code highlighting                  | Shiki, host-theme synchronized.                                                                                                                                                                                     |
| 14  | Bundling                           | esbuild for extension host, Vite (Rolldown) for webviews.                                                                                                                                                           |
| 15  | New file UX                        | Prompt for title, scaffold frontmatter, open in Reader.                                                                                                                                                             |
| 16  | GitHub feature parity scope        | Yes: callouts, mermaid, math, footnotes, tasks, emoji. No: GitHub-ref autolinks (`#123`, `@user`).                                                                                                                  |
| 17  | Marketplace details                | TBD (publisher, display name, icon, banner).                                                                                                                                                                        |
| 18  | Reader metadata strip              | Sits in a sticky header above the rendered body, alongside the toolbar. Renders `tags` (chips), `type` and `status` (filled badges). Plain neutral colors; per-type color/icon mapping deferred to Phase 2.5.       |
| 19  | Logical nodes (`group`)            | Frontmatter `group` (list of gitignore-style globs) attaches matching same-folder siblings as logical children in the Cortex Explorer. Multi-parent allowed; cycles broken by first-write-wins; index files exempt. |

---

## 15. Open Questions / Deferred

- **Drag-and-drop file moves with link rewriting** in the Cortex Explorer — stretch for v1; punt to v2 if it adds risk.
- **Custom Cortex search panel** — v2.
- **Mobile / Web targets** — out of scope; revisit only if Cortex matures.
- **Reader: side-by-side affordance** — explicitly not implemented in v1, but cheap to add later if demanded.
- **"Edit Source" split behavior** (modifier-held opens to side?) — TBD during Phase 2 implementation.

---

## 16. Success Criteria

Since this is a personal tool, success is measured by:

- **Daily-drivable:** Cortex replaces both Obsidian (for browsing/linking notes) and the built-in markdown preview (for reading) in the author's day-to-day VS Code use.
- **No friction with Git:** Nexus contents are clean, committed, and render correctly on github.com with zero manual fixup. The same `.md` file looks essentially identical in Cortex and on GitHub.
- **Renders what GitHub renders:** callouts, mermaid, math, task lists, footnotes, and code with theme-matched syntax highlighting all "just work."
- **Discoverable:** the backlinks panel and graph view surface connections that aren't obvious from the file tree alone.
- **Portable:** installs and runs identically in VS Code, Cursor, and Windsurf with the same `.vsix`.
