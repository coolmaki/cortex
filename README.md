# Cortex

> Your repo's brain.

Cortex turns any folder in VS Code into a **local-first, GitHub-compatible markdown knowledge base**. It adds its own sidebar (frontmatter-titled file tree, backlinks) and a **GitHub-fidelity markdown reader** — while leaving editing, search, tabs, and theming to VS Code.

There's no proprietary syntax and no lock-in. Cortex reads plain GitHub-flavored Markdown with relative links, so every document renders identically in Cortex and on github.com. Your notes stay portable, version-controllable, and readable anywhere markdown is.

> **Status:** pre-release. The Reader and core navigation are functional today (v0.1.0); backlinks, logical-node grouping, and the graph view are upcoming. Marketplace publish lands with v1.0.

---

## What you get

### A reader that matches GitHub

Open any `.md` file from the Cortex sidebar and it renders in a webview-backed tab with the same fidelity as github.com:

- GFM tables, task lists, strikethrough, autolinks
- Callouts (`> [!NOTE | TIP | IMPORTANT | WARNING | CAUTION]`)
- Fenced code with **Shiki** syntax highlighting (themes track your VS Code light/dark choice)
- Math via **KaTeX** — `$inline$` and `$$display$$`
- Diagrams via **Mermaid** — flowcharts, sequence diagrams, etc.
- Footnotes, emoji shortcodes (`:smile:` → 😄)
- Heading anchors using GitHub's slug algorithm — in-document and cross-document `#heading` links resolve identically

Math and Mermaid bundles are lazy-loaded — documents that don't use them don't pay the cost.

### Live preview without a side-by-side dance

Edit the source in any editor; the Reader re-renders within ~150ms while preserving your scroll position. The Reader and source aren't yoked together — they're independent tabs you can arrange however you like.

### Mini-browser navigation inside the Reader

A sticky toolbar (Back / Forward / Reload / Edit Source) sits above every document. Clicking an internal `[other doc](./other.md)` link navigates the Reader to that doc. Back and forward restore prior scroll positions. External `https://` links open in your system browser. Same-page `#anchor` links scroll without re-rendering.

### A frontmatter-aware file tree

The Cortex Explorer shows your `.md` files using their frontmatter `title`, not their filenames. Folders containing a `README.md`, `INDEX.md`, or `index.md` merge with that index file — the folder displays the index's title, and clicking the folder opens that file. Files with no frontmatter `title` are hidden from Cortex's views (but still shown in VS Code's built-in Explorer).

### A metadata strip on every doc

`tags`, `type`, and `status` from your frontmatter render as chips and badges above the document body, so the document's identity is visible at a glance.

### Multi-root + safe size limits

Workspaces with several `.cortex/` folders are surfaced as switchable nexuses (status bar quick-pick). Documents over 500 KB don't render through the full pipeline by default — you get a notice with a "Render anyway" override.

---

## Quick start

1. Open a folder in VS Code.
2. Run **Cortex: Initialize Cortex Nexus** from the command palette. This creates a `.cortex/` directory in the workspace and activates the extension.
3. Click the Cortex icon in the Activity Bar.
4. Create a markdown file with frontmatter:

    ```markdown
    ---
    title: My First Note
    tags: [welcome]
    ---

    Hello, **Cortex**.
    ```

5. The file appears in the Cortex Explorer. Single-click opens it in the Reader; right-click → **Open Source** opens it in a regular editor.

A nexus typically sits at the root of a Git repository, so your knowledge base versions naturally alongside your code.

---

## Core concepts (in one breath each)

- **Nexus** — any workspace folder containing a `.cortex/` directory. Cortex operates on one nexus at a time.
- **Frontmatter `title`** — required for a `.md` file to appear in Cortex's tree. (Standard files without one are still visible in VS Code's built-in Explorer.)
- **Index files** — `README.md` / `INDEX.md` / `index.md` merge with their parent folder in the tree.
- **Ignore rules** — Cortex honors your `.gitignore`, plus an optional `.cortex/ignore` for hiding source directories (`src/`, `tests/`) from Cortex's views without affecting Git.

The full product spec, including the rendering pipeline, link semantics, and configuration model, lives in [docs/PRD.md](docs/PRD.md).

---

## Commands

| Command                           | Description                                                     |
| --------------------------------- | --------------------------------------------------------------- |
| `Cortex: Initialize Cortex Nexus` | Create `.cortex/` in a chosen workspace folder.                 |
| `Cortex: Switch Nexus`            | Pick the active nexus (visible only when ≥ 2 candidates exist). |
| `Cortex: Open in Reader`          | Open the focused file in the Reader (also via single-click).    |
| `Cortex: Open Source`             | Open the focused file in a regular editor.                      |
| `Cortex: Refresh Explorer`        | Force-refresh the file tree.                                    |

More commands ship with each phase.

---

## Roadmap

| Phase | Scope                                                                                                                                            | Status         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| **1** | Activity Bar + Cortex Explorer, nexus discovery, multi-root switching, ignore + frontmatter filtering, index file merging                        | ✅ Shipped      |
| **2** | GitHub-fidelity Reader: markdown-it + plugins, Shiki, KaTeX, Mermaid, internal navigation, live re-render, metadata strip, soft size limit       | ✅ Shipped (v0.1.0) |
| **3** | Logical-node grouping (`group` frontmatter) + Backlinks tree view + persistent link graph                                                        | Next           |
| **4** | Force-directed graph view (D3)                                                                                                                   | Planned        |
| **5** | Focus Mode, New File scaffolding, settings surface, Marketplace publish                                                                          | Planned        |

See [docs/plan/](docs/plan/) for per-phase implementation plans.

---

## Compatibility

Cortex sticks to stable VS Code APIs only — no `proposedApi` flags. The same `.vsix` is intended to run in:

- **VS Code** ≥ 1.100
- **Cursor**
- **Windsurf**

VS Code for the Web is out of scope (Cortex relies on Node-only APIs in the extension host).

---

## Development

For local setup, build commands, project structure, and codebase conventions, see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

---

## License

[MIT](LICENSE)
