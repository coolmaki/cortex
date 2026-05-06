# Cortex

A VS Code extension that turns any workspace folder into a local-first, GitHub-compatible markdown knowledge base. Pre-release; Phases 1–3 are shipped (v0.2.0): sidebar, file tree, nexus discovery, GitHub-fidelity Reader, logical-node grouping, and Backlinks panel. The graph view (Phase 4) is next. The full product spec lives in [docs/PRD.md](docs/PRD.md).

## Terminology

- **Nexus** — any workspace folder containing a `.cortex/` directory at its root. The unit Cortex operates on. Multi-root workspaces can have several nexuses, but only one is active at a time. Nested nexuses are ignored.
- **Cortex View** — the dedicated Activity Bar sidebar (separate from the built-in Explorer) hosting the Cortex Explorer and Backlinks tree views.
- **Reader** — the GitHub-fidelity markdown preview, opened as a webview-backed editor tab. Renders via markdown-it + Shiki + KaTeX + Mermaid with live re-render on source edits.
- **Index file** — `README.md`, `INDEX.md`, or `index.md` (in priority order) in a folder. Merged into the folder node in the Cortex Explorer; the file isn't shown as a separate child.
- **Logical node** — a doc declaring a `group` frontmatter property (a list of gitignore-style globs). The doc renders as an expandable parent in the Cortex Explorer, absorbing matching same-folder siblings as logical children. Presentation-only; the on-disk layout is unchanged.
- **Link graph** — the in-memory directed graph of relative links between `.md` files, persisted at `.cortex/cache/linkgraph.json`. Powers the Backlinks panel and (later) the graph view.

## Architecture

The codebase has a hard split between two execution contexts. **Code never crosses this boundary directly — only via `postMessage`:**

- `src/extension/` — Node.js extension host. Bundled to a single CJS file (`out/extension.js`) by esbuild. Has access to the `vscode` API and Node built-ins.
- `src/webviews/` — sandboxed iframe UI. One Vite bundle per webview under `out/webviews/<name>/`. No Node APIs; uses `acquireVsCodeApi()` to message the host.

Importing across this boundary will fail to bundle or break at runtime. Path-scoped rules in `.claude/rules/` cover the conventions for each side and auto-load when files in those paths are read.

## Repo layout

```
src/extension/           Extension host code (TS → esbuild)
src/webviews/            Webview bundles (TS/CSS/HTML → Vite)
tests/extension/         Vitest unit tests, mirroring src/extension/
assets/                  Static assets (Activity Bar icon)
docs/                    PRD + design docs
```

The `@/` path alias maps to `src/` everywhere (TS, esbuild, Vite, Vitest). Use it for cross-directory imports within `src/`; same-directory imports stay relative.

## Commands

```bash
pnpm build        # esbuild + vite
pnpm watch        # rebuild on changes (host + webviews concurrently)
pnpm typecheck    # tsc --noEmit on both tsconfigs
pnpm lint         # ESLint
pnpm format       # Prettier write
pnpm test         # Vitest run
pnpm package      # produce cortex-<version>.vsix
```

To run the extension in a development host, open the repo in VS Code and press `F5` (uses `.vscode/launch.json`).

## Conventions

Formatting is enforced by Prettier + ESLint with format-on-save: double quotes, 4-space indent, semicolons, trailing commas, braces on every control-flow body, `import type` for type-only imports. Don't fight the formatter.

For project-specific guidance (testing approach, extension/webview constraints, TS import patterns), see `.claude/rules/`.
