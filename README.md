# Cortex

> Your repo's brain.

A VS Code extension that turns any workspace folder into a **local-first, GitHub-compatible markdown knowledge base**. Cortex layers its own sidebar (file tree, backlinks, graph) and a GitHub-fidelity markdown reader on top of VS Code, while delegating editing, search, theming, and tabs to the host.

Cortex speaks plain GitHub-flavored Markdown with relative links — every link, anchor, and image renders identically in Cortex and on github.com. No proprietary syntax, no lock-in: your notes stay portable, version-controllable, and readable anywhere markdown is rendered.

> **Status:** pre-release. Phase 1 (sidebar + file tree + nexus discovery + placeholder reader) is implemented. The real markdown rendering pipeline, backlinks, graph view, and Marketplace publish are upcoming. See the [PRD](docs/PRD.md) for the full product spec.

## Core Concepts

### Nexus

A **nexus** is any workspace folder containing a `.cortex/` directory at its root. That's the only signal Cortex needs to recognize a knowledge base.

```
my-repo/
├── .cortex/
│   └── ignore         # Optional: gitignore-syntax rules layered on top of .gitignore
├── docs/
│   └── notes.md
└── src/
```

Multi-root workspaces can have several nexuses — only one is active at a time. Switch between them via the status bar item or `Cortex: Switch Nexus`. Nested nexuses are ignored — the outer nexus governs the whole tree.

### Frontmatter Title Requirement

Markdown files must have YAML frontmatter with a `title:` field to appear in Cortex's tree, graph, or backlinks:

```markdown
---
title: My Document
---

Content here.
```

Files without a valid `title` are invisible to Cortex's own views. They still appear in VS Code's built-in Explorer — Cortex doesn't (and can't) hide files there.

This rule exists because repositories often contain many `README.md` files at different levels; using the frontmatter title as the canonical display name keeps every node uniquely identifiable.

### Index Files

A folder containing `README.md`, `INDEX.md`, or `index.md` (in that priority order) is merged with that file:

- The folder node adopts the index file's `title` as its label.
- Clicking the folder opens the index file in the Reader.
- The index file is **not** shown as a separate child entry.

### Ignore Rules

Cortex applies two ignore layers, in order:

1. The workspace's `.gitignore` (standard gitignore semantics).
2. `.cortex/ignore` — Cortex-specific patterns layered on top, useful for hiding source directories (`src/`, `tests/`) from Cortex's views without affecting Git.

Both layers are watched live; changes update the tree automatically.

## Getting Started

1. Open a folder in VS Code.
2. Run **Cortex: Initialize Cortex Nexus** from the command palette — this creates `.cortex/` in the workspace and activates the extension.
3. Click the Cortex icon in the Activity Bar to open the Cortex View.
4. Create a markdown file with frontmatter:

    ```markdown
    ---
    title: My First Note
    ---

    Hello, Cortex.
    ```

5. The file appears in the Cortex Explorer. Click to open in the Reader, or right-click → **Open Source** to edit the raw markdown.

## Commands

| Command                           | Description                                                     |
| --------------------------------- | --------------------------------------------------------------- |
| `Cortex: Initialize Cortex Nexus` | Create `.cortex/` in a chosen workspace folder.                 |
| `Cortex: Switch Nexus`            | Pick the active nexus (only visible when ≥ 2 candidates exist). |
| `Cortex: Refresh Explorer`        | Force-refresh the file tree.                                    |

More commands land with each phase (see roadmap).

## Roadmap

| Phase | Scope                                                                                                                                                         | Status  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **1** | Activity Bar + Cortex Explorer, nexus discovery, multi-root switching, ignore + frontmatter filtering, index file merging, placeholder Reader                 | Done    |
| **2** | Real markdown rendering: markdown-it, Shiki, callouts (`> [!NOTE]`), Mermaid, KaTeX, footnotes, emoji shortcodes, internal link navigation, GitHub-styled CSS | Planned |
| **3** | Backlinks tree view + force-directed graph view (D3)                                                                                                          | Planned |
| **4** | Focus Mode, New File scaffolding, settings, Marketplace publish                                                                                               | Planned |

## Compatibility

Cortex sticks to stable VS Code APIs only — no `proposedApi` flags. The same `.vsix` is intended to run in:

- **VS Code** ≥ 1.100
- **Cursor**
- **Windsurf**

VS Code for the Web is out of scope (Cortex relies on Node-only APIs in the extension host).

## Development

Requires Node.js ≥ 20 and pnpm ≥ 10.

```bash
pnpm install
pnpm build              # Build extension host + webviews once
pnpm watch              # Rebuild on changes (host + webviews concurrently)
pnpm typecheck          # tsc --noEmit across both tsconfigs
pnpm lint               # ESLint
pnpm format             # Prettier write across the repo
pnpm test               # Vitest run
pnpm package            # Produce cortex-<version>.vsix in the project root
```

To run the extension in a development host, open the repo in VS Code and press `F5` (uses `.vscode/launch.json`).

### Project Structure

```
src/
  extension/            VS Code extension host code (Node)
  webviews/             Webview UI bundles (isolated iframes)
tests/
  extension/            Unit tests, mirroring src/extension/
assets/                 Static assets (Activity Bar icon)
docs/                   PRD and design docs
```

The `@/` path alias maps to `src/` in TypeScript, esbuild, Vite, and Vitest.

### Tech Stack

- **TypeScript 6** — extension host + webviews
- **esbuild** — bundles the extension host (single `out/extension.js`)
- **Vite 8** — bundles webviews (one bundle per webview)
- **Vitest 4** — unit tests for pure-logic services
- **gray-matter** — frontmatter parsing
- **ignore** — gitignore semantics
- **Prettier + ESLint** + `typescript-eslint` — formatting + linting (auto-format on save)

## License

[MIT](LICENSE)
