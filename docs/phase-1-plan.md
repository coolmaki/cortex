# Cortex — Phase 1 Implementation Plan

## Context

[`PRD.md`](PRD.md) specifies **Cortex**, a VS Code extension that turns any workspace folder into a local-first, GitHub-compatible markdown knowledgebase. The repo is greenfield — only `docs/PRD.md`, `README.md`, `.gitignore`, and `.npmrc` exist.

This document covers **Phase 1 only** (PRD §13): repo scaffold, Activity Bar contribution, multi-root nexus discovery + switching, frontmatter + ignore services, the Cortex Explorer tree view, a placeholder Reader webview, and the status bar item.

The intended outcome is a working `.vsix` you can sideload that:

- Adds a Cortex icon to the Activity Bar; clicking it reveals the Cortex View.
- Detects nexuses across all workspace folders, lets you switch between them via the status bar.
- Lets you initialize a new nexus in any open workspace folder.
- Shows a frontmatter-titled, ignore-filtered, index-file-merging file tree.
- Single-click on a tree node opens a placeholder Reader (raw `<pre>` markdown — no rendering pipeline yet).
- Right-click → **Open Source** opens the underlying `.md` in a normal VS Code editor.

What this phase **does not** include (deferred per PRD §13):

- Real markdown rendering pipeline (Phase 2).
- Live re-render on edits (Phase 2).
- Backlinks panel + link graph (Phase 3).
- Graph view (Phase 3).
- Focus mode toggle, New File frontmatter scaffolding, full `cortex.*` settings surface (Phase 4).

---

## Locked Decisions for Phase 1

1. **Bundling:** esbuild for the extension host (`src/` → `out/extension.js`); Vite (with Rolldown) for webviews (`webviews/<name>/` → `out/webviews/<name>/`).
2. **Package manager:** pnpm. Existing `.npmrc` already allows the esbuild post-install build.
3. **Frontmatter parser:** `gray-matter` (lightweight, YAML out of the box).
4. **Ignore parser:** `ignore` (npm package; honors gitignore semantics).
5. **Phase 1 scope of `.gitignore` honoring:** root-level `.gitignore` of the active nexus + `.cortex/ignore`. **Nested `.gitignore` files in subdirectories are deferred** — flagged here as a known limitation; revisit before v1 publish if it bites.
6. **Multi-root nexus is in scope from day one.** Retrofitting it later means rewriting NexusService; better to design for it now.
7. **Placeholder Reader:** webview tab that displays escaped raw markdown inside `<pre>`. Same panel reused for the active file (matches built-in markdown preview behavior). One "Edit Source" button. No styling, no rendering.
8. **Testing:** Vitest unit tests for the three pure-logic services (frontmatter, ignore, nexus discovery). VS Code-API-bound code (tree provider, status bar, webview lifecycle) verified manually in the Extension Development Host. `@vscode/test-electron` is overkill for Phase 1's surface area; defer.
9. **Activation events:** `onView:cortex.explorer` (Activity Bar click) plus `workspaceContains:**/.cortex` (proactive activation when any workspace folder has `.cortex/`). The latter ensures the status bar item appears without the user needing to open the Cortex View first.
10. **Activity Bar icon:** placeholder monochrome SVG in `media/cortex.svg`; final icon is a Phase 4 concern.

---

## Stage 0 — Repo & Build Scaffold

**Goal:** `pnpm build` produces a runnable extension; F5 in VS Code launches an Extension Development Host with the empty extension loaded (no UI yet).

### Files to create

```
cortex/
├── package.json                 # extension manifest + scripts + deps
├── tsconfig.json                # extension host (CommonJS, Node18, strict)
├── tsconfig.webviews.json       # webviews (ESNext, DOM)
├── esbuild.config.mjs           # bundles src/extension.ts → out/extension.js
├── vite.config.ts               # bundles webviews → out/webviews/<name>/
├── .vscodeignore                # exclude src/, node_modules dev stuff from .vsix
├── src/extension.ts             # activate() + deactivate() stubs
└── README.md                    # one-liner; expanded in Phase 4
```

### `package.json` essentials

- `name`, `displayName`, `description`, `version: "0.0.1"` — publisher TBD (placeholder for now).
- `engines.vscode`: `^1.85.0` (or current; pick something that Cursor/Windsurf both ship). Verify at scaffold time.
- `main`: `./out/extension.js`.
- `activationEvents`: `["onView:cortex.explorer", "workspaceContains:**/.cortex"]`.
- Scripts:
  - `build` — `pnpm build:host && pnpm build:webviews`
  - `build:host` — `node esbuild.config.mjs`
  - `build:webviews` — `vite build`
  - `watch` — runs both in watch mode (parallel; e.g. via `npm-run-all` or two `&` processes — pick during scaffolding)
  - `package` — `vsce package --no-dependencies` (after install of `@vscode/vsce` as dev dep)
  - `typecheck` — `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.webviews.json`
- Dev deps: `typescript`, `esbuild`, `vite`, `@types/vscode` (matching engines.vscode), `@types/node`, `vitest`, `@vscode/vsce`.
- Runtime deps: `gray-matter`, `ignore`.

### `esbuild.config.mjs` shape

```js
import esbuild from 'esbuild';
const watch = process.argv.includes('--watch');
const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
});
if (watch) await ctx.watch(); else { await ctx.rebuild(); await ctx.dispose(); }
```

### `vite.config.ts` shape

- `build.outDir`: `out/webviews`
- `build.rollupOptions.input`: map of webview name → entry HTML (`webviews/reader/index.html` for Phase 1).
- `build.emptyOutDir`: false (so it doesn't wipe esbuild's output).
- One bundle per webview entry; assets emitted alongside.

### `.gitignore` additions

Append to existing:
```
out/
*.vsix
.vscode-test/
```

### Acceptance for Stage 0

- `pnpm install && pnpm build` succeeds.
- F5 opens an Extension Development Host with no errors. (No visible UI yet — that's Stage 1.)

---

## Stage 1 — Activation, Activity Bar, Empty Cortex View

**Goal:** Cortex icon appears in the Activity Bar. Clicking it opens a sidebar with an "Explorer" tree view that shows a single placeholder node ("Loading…").

### `package.json` contributions

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "cortex", "title": "Cortex", "icon": "media/cortex.svg" }
      ]
    },
    "views": {
      "cortex": [
        { "id": "cortex.explorer", "name": "Explorer", "type": "tree" }
      ]
    }
  }
}
```

### Files to add

- `media/cortex.svg` — 24×24 monochrome placeholder. (Anything; a stylized "C" or generic graph node works.)
- `src/tree/explorer.ts` — minimal `vscode.TreeDataProvider<CortexNode>` returning a single static "Loading…" node.
- `src/extension.ts` — `activate()` registers the tree data provider against `cortex.explorer`.

### Acceptance for Stage 1

- F5 → Activity Bar shows the Cortex icon.
- Click → sidebar opens, shows "Cortex" container with one "Explorer" view containing the placeholder node.

---

## Stage 2 — Foundational Services (Frontmatter + Ignore)

**Goal:** Two pure-logic services with unit tests. Used by everything in subsequent stages.

### `src/frontmatter/frontmatter.ts` — `FrontmatterService`

- `parse(uri: vscode.Uri): Promise<Frontmatter | null>` — reads file via `vscode.workspace.fs.readFile`, parses with `gray-matter`. Returns `null` if no frontmatter, no `title`, or parse error.
- `getTitle(uri: vscode.Uri): Promise<string | null>` — convenience.
- In-memory cache: `Map<string, { mtimeMs: number; data: Frontmatter | null }>` keyed by `uri.toString()`. Stat the file before returning cached data; bust on mtime mismatch.
- `invalidate(uri: vscode.Uri)` — explicit bust, called by callers reacting to FS events.

### `src/ignore/ignore.ts` — `IgnoreService`

- Constructed against a nexus root `vscode.Uri`.
- Loads `<root>/.gitignore` and `<root>/.cortex/ignore` if present, combines into a single `ignore` instance.
- `isIgnored(relPath: string): boolean` — pass relative POSIX path from nexus root.
- `reload(): Promise<void>` — re-reads both files. Called by NexusService when either source changes.
- Phase 1: root-level `.gitignore` only (see Locked Decision #5).

### Tests

- `src/frontmatter/frontmatter.test.ts`: valid frontmatter, missing title, no frontmatter, malformed YAML, cache hit/miss on mtime change.
- `src/ignore/ignore.test.ts`: pattern from `.gitignore` only, pattern from `.cortex/ignore` only, both layered, missing files, reload after change.

### Acceptance for Stage 2

- `pnpm test` passes for both services.
- No VS Code Extension Host needed — these are pure logic.

---

## Stage 3 — NexusService + Status Bar + Switch / Initialize Commands

**Goal:** Multi-root nexus discovery, persistent active selection, status bar item, switch + initialize commands.

### `src/nexus/nexus.ts` — `NexusService`

State:
- `candidates: vscode.WorkspaceFolder[]` — all workspace folders containing `<folder>/.cortex/`.
- `active: vscode.WorkspaceFolder | undefined` — the currently active nexus.
- `_onDidChangeActive: vscode.EventEmitter<vscode.WorkspaceFolder | undefined>`; expose as `onDidChangeActive`.

Discovery:
- On construction and on `vscode.workspace.onDidChangeWorkspaceFolders`: re-scan all workspace folders for `.cortex/` (use `vscode.workspace.fs.stat`).
- File watcher per workspace folder for `.cortex` directory creation/deletion (`workspace.createFileSystemWatcher(new RelativePattern(folder, '.cortex'))`). Re-scan on event.

Active selection:
- On scan: prefer the previously-active folder (read URI string from `workspaceState.get('cortex.activeNexus')`) if it's still a candidate. Otherwise pick the first candidate by workspace order. If zero candidates, `active = undefined`.
- `setActive(folder)` — updates internal state, persists to `workspaceState`, fires event.
- `setActiveByPick()` — opens a `vscode.window.showQuickPick` of candidates labeled by `folder.name`, with the active one marked. Calls `setActive` with the chosen folder.

### `src/statusbar/statusbar.ts` — status bar binding

- Create a left-aligned `StatusBarItem` with low priority.
- Subscribe to `nexus.onDidChangeActive`; update text and tooltip per PRD §6.6.
- Item's `command` is `cortex.nexus.openOrSwitch` — a meta-command that:
  - If `nexus.candidates.length >= 2`: invokes `cortex.nexus.switch`.
  - Else: invokes `workbench.view.extension.cortex` (reveals the Cortex View).
- Set context key `cortex.nexusCandidates` (a number) via `vscode.commands.executeCommand('setContext', ...)` so the `Cortex: Switch Nexus` palette entry can be hidden when fewer than 2 candidates exist.

### Commands

In `src/commands/index.ts`, register:

| Command ID | Handler |
|---|---|
| `cortex.nexus.initialize` | If 0 workspace folders, error toast. If 1, create `.cortex/` there. If >1, `showQuickPick` of folders (excluding ones that already have `.cortex/`), then create. NexusService's watcher picks up the change automatically. |
| `cortex.nexus.switch` | `nexus.setActiveByPick()`. |
| `cortex.nexus.openOrSwitch` | Meta dispatcher (see above). |

`package.json` `contributes.commands` and `contributes.menus.commandPalette` updated accordingly. Hide `cortex.nexus.switch` from the palette when `cortex.nexusCandidates < 2` using a `when` clause.

### `src/extension.ts` wires it up

```ts
export async function activate(context: vscode.ExtensionContext) {
  const nexus = new NexusService(context);
  await nexus.scan();
  context.subscriptions.push(nexus);
  context.subscriptions.push(createStatusBar(nexus));
  registerCommands(context, nexus);
  // Tree provider registration moves here in Stage 4
}
```

### Tests

- `src/nexus/nexus.test.ts` covers the **pure** discovery logic (`pickActive(prevId, candidates)` returns previous if present, else first, else undefined). Don't mock the VS Code API; extract the logic.

### Acceptance for Stage 3

- Open a workspace with no `.cortex/` → status bar shows "Cortex: no nexus."
- Run `Cortex: Initialize Cortex Nexus` → `.cortex/` created, status bar updates to show the folder name.
- Open a multi-root workspace with two `.cortex/` folders → status bar shows one; clicking it opens the quick-pick; selecting the other folder updates the status bar; reload window → selection persists.
- Delete `.cortex/` from disk → status bar updates.
- `Cortex: Switch Nexus` is hidden from the command palette when fewer than 2 candidates exist.

---

## Stage 4 — Cortex Explorer (the Real Tree)

**Goal:** The tree view shows the active nexus's titled `.md` files with index-file folder merging, ignore filtering, and click-to-open into the placeholder Reader.

### `src/tree/explorer.ts` — `CortexExplorerProvider`

Implements `vscode.TreeDataProvider<CortexNode>` where:

```ts
type CortexNode =
  | { kind: 'folder'; uri: vscode.Uri; label: string; indexUri?: vscode.Uri }
  | { kind: 'file'; uri: vscode.Uri; label: string };
```

Construction:
- Takes `NexusService`, `FrontmatterService`, `IgnoreService`.
- Subscribes to `nexus.onDidChangeActive`; recreates `IgnoreService` for the new root and fires a tree refresh.
- Owns a `workspace.createFileSystemWatcher(new RelativePattern(activeRoot, '**/*.md'))` and `workspace.createFileSystemWatcher(new RelativePattern(activeRoot, '{.gitignore,.cortex/ignore}'))`. Refresh events debounced ~100ms.

`getChildren(node?)`:
- If `node` undefined → list children of `active.uri`.
- Else → list children of `node.uri` (folder).
- Read directory with `vscode.workspace.fs.readDirectory(uri)`.
- Filter:
  - Skip `.git/`, `.cortex/`, dotfiles.
  - Skip anything matching `IgnoreService.isIgnored(relPathFromRoot)`.
  - For files: keep only `*.md` with `await frontmatter.getTitle(fileUri) !== null`.
- For each subdirectory, peek for an index file using priority `README.md > INDEX.md > index.md`; if one exists with a valid title, that subfolder's `CortexNode` carries `indexUri` and `label = indexTitle`. Otherwise `label = dirname`.
- For the current folder being listed, **omit its own index file from the returned children** (it's been merged into the folder node already at the parent level).
- Sort: folders first (alphabetical by label), then files (alphabetical by title).

`getTreeItem(node)`:
- Folder: `collapsibleState = Collapsed`; `contextValue = node.indexUri ? 'cortexFolderWithIndex' : 'cortexFolder'`; if `indexUri`, set `command` to `cortex.tree.openInReader` with `indexUri` as arg.
- File: `collapsibleState = None`; `contextValue = 'cortexFile'`; `command` = `cortex.tree.openInReader` with `node.uri`; `resourceUri` set to enable theming/icons.

Empty / no-nexus state:
- If `nexus.active === undefined`: return a single non-clickable node "No nexus found" plus an "Initialize Cortex Nexus" node whose command is `cortex.nexus.initialize`. Use a `viewsWelcome` contribution in `package.json` instead if cleaner.

### Commands added in this stage

| Command ID | Handler |
|---|---|
| `cortex.tree.openInReader` | Calls `ReaderProvider.open(uri)` (see Stage 5). |
| `cortex.tree.refresh` | Forces `provider.refresh()`. (Useful during dev.) |

### Acceptance for Stage 4

- Tree shows only titled `.md` files.
- A folder with a `README.md` (with `title`) shows the README's title as the folder label; the README is not listed as a separate child; clicking the folder opens the README in the Reader.
- Files matching `.gitignore` or `.cortex/ignore` do not appear.
- Adding a new titled `.md` file outside VS Code (e.g., `touch foo.md && echo "..."`) appears in the tree within ~200ms.
- Renaming the `title` in frontmatter updates the tree label after save.

---

## Stage 5 — Placeholder Reader Webview

**Goal:** A webview tab opens when the user clicks a tree node, displaying the file's raw markdown in a `<pre>`. One "Edit Source" button. No rendering pipeline yet.

### `src/reader/provider.ts` — `ReaderProvider`

- `open(uri: vscode.Uri): Promise<void>`:
  - If a Reader panel already exists, reveal it and `postMessage({ type: 'init', uri, content })`.
  - Else `vscode.window.createWebviewPanel('cortex.reader', frontmatter.title, ViewColumn.Active, { enableScripts: true, localResourceRoots: [activeRoot, extensionUri] })`.
  - Set `panel.webview.html` from a template (see below).
  - Wire `panel.webview.onDidReceiveMessage`: handle `openSource` → `vscode.window.showTextDocument(uri, { viewColumn: ViewColumn.Beside })`.
  - Wire `panel.onDidDispose` → null out the cached panel reference.

### `webviews/reader/`

- `index.html` — minimal: title, `<header>` with "Edit Source" button, `<main id="content"></main>`, `<script type="module" src="/main.ts">`.
- `main.ts` — listens for messages from the host; on `init`, sets `#content` to `<pre>{escaped raw markdown}</pre>`. Button click posts `{ type: 'openSource' }` to the host.
- `styles.css` — a few lines: monospace `<pre>`, container padding, button styling.

### Webview HTML wiring (host side)

- Read the built `out/webviews/reader/index.html`.
- Replace asset paths with `webview.asWebviewUri(...)` calls.
- Inject a CSP `<meta>`: default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:.
- Inject a `<script>` with the `acquireVsCodeApi()` handle and a known `nonce`.

(There are several conventional ways to do this — pick during scaffolding. Most extensions just have a `getReaderHtml(panel, extensionUri)` helper.)

### Acceptance for Stage 5

- Clicking a tree node opens the Reader as a tab in the active editor group.
- Tab title = frontmatter title.
- Body shows raw markdown inside a `<pre>`.
- Clicking another file reuses the same panel (panel does not multiply).
- "Edit Source" button opens the source `.md` in a side editor.
- Closing the panel and reopening creates a fresh one cleanly.

---

## Stage 6 — Right-Click Context Menu

**Goal:** Right-click on a file (or folder-with-index) in the Cortex Explorer surfaces an "Open Source" action.

### `package.json` additions

```json
{
  "contributes": {
    "commands": [
      { "command": "cortex.tree.openSource", "title": "Open Source", "category": "Cortex" }
    ],
    "menus": {
      "view/item/context": [
        {
          "command": "cortex.tree.openSource",
          "when": "view == cortex.explorer && (viewItem == cortexFile || viewItem == cortexFolderWithIndex)",
          "group": "navigation"
        }
      ]
    }
  }
}
```

### Handler

In `src/commands/index.ts`:
- `cortex.tree.openSource(node: CortexNode)` → resolve URI (`node.uri` for file, `node.indexUri` for folder-with-index), call `vscode.window.showTextDocument(uri)`.

### Acceptance for Stage 6

- Right-click a file → "Open Source" appears → clicking opens the `.md` in a normal editor tab.
- Right-click a folder-with-index → same; opens the index `.md`.
- Right-click a folder-without-index → no "Open Source" action (correct; nothing to open).

---

## Stage 7 — Verification & Packaging

### Manual smoke test

Walk through every acceptance bullet from Stages 1–6. Specifically exercise:

- Single-root, no nexus → Initialize → tree populates.
- Single-root, existing nexus → tree populates immediately on extension activation.
- Multi-root, two nexuses → status bar shows one; switch via quick-pick.
- Multi-root, zero nexuses → "No nexus found" state in both views and status bar.
- A nexus with `.gitignore` containing `node_modules/` and `dist/` → those folders not in the tree.
- A nexus with `.cortex/ignore` containing `src/` → `src/` not in the tree.
- A folder containing only `.ts` files → currently still shown as an empty folder (Focus Mode is Phase 4; document this).
- Markdown files without frontmatter → not in the tree.
- Markdown files with frontmatter but no `title` → not in the tree.
- Renaming a file's title and saving → tree label updates.
- Reader displays raw markdown; "Edit Source" button works.

### Smoke-test in forks

Sideload the `.vsix` into Cursor (and Windsurf if installed). Confirm activation, tree, status bar, and Reader work identically. (No code changes expected; this is a sanity check on the "stable APIs only" promise.)

### Package

- `pnpm package` produces `cortex-0.0.1.vsix`.
- Install locally via `code --install-extension cortex-0.0.1.vsix`. Confirm it loads on a real VS Code window (not just the dev host).

---

## Decisions Deferred to Implementation Time

These are intentionally not pre-decided in this plan; resolve when you hit them:

1. **Watch mode runner** — `npm-run-all -p`, two `&` shell processes, or two terminal tabs. Pick whichever is smoothest in your dev loop.
2. **`viewsWelcome` vs. inline placeholder node** for the "No nexus" state — `viewsWelcome` is the VS Code-idiomatic answer but slightly more verbose; the inline node is simpler. Try `viewsWelcome` first.
3. **Reader panel reuse vs. per-file panels** — Phase 1 reuses one panel (matches built-in preview). If this feels wrong in practice, revisit in Phase 2.
4. **Activity Bar icon SVG content** — placeholder; whatever you draw is fine for Phase 1.
5. **Exact `engines.vscode` version** — pick the lowest version that works in current Cursor + Windsurf builds. Check at scaffold time.

---

## Known Limitations Carried Out of Phase 1

To be addressed in later phases or before publish:

- **Nested `.gitignore` files** are not honored. If `src/foo/.gitignore` says `bar/`, Cortex will still show `src/foo/bar/`. Defer to a later phase; document in README under "Known limitations" if Phase 1 ships externally.
- **No live re-render in the Reader** — editing source while the placeholder Reader is open does not update it. This is by design; the live update path lives in Phase 2 alongside the real rendering pipeline.
- **No backlinks, no graph, no focus mode, no New File scaffolding, no settings UI.** All deliberate Phase boundaries.
- **No telemetry, no error reporting.** Cortex is silent on failure beyond `console.error` + `vscode.window.showErrorMessage` for user-facing problems. Acceptable for a personal tool; revisit before Marketplace publish if desired.

---

## Phase 1 Definition of Done

- All Stage acceptance bullets pass.
- `pnpm typecheck && pnpm test && pnpm build && pnpm package` is green.
- Manual smoke test passes in VS Code; sideload check passes in Cursor.
- README has a one-paragraph "What is Cortex" + a "Phase 1: what works today" callout.
- This plan committed; PRD §13 Phase 1 milestones all crossed off in commit message.
