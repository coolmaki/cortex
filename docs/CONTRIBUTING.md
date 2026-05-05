---
title: Contributing
---

# Contributing to Cortex

Local development setup, build commands, and codebase conventions for working on the Cortex extension itself.

## Requirements

- Node.js ≥ 20
- pnpm ≥ 10

## Commands

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

## Project Structure

```
src/
  extension/            VS Code extension host code (Node) — bundled to out/extension.js by esbuild
  webviews/             Webview UI bundles (isolated iframes) — one Vite bundle per webview
tests/
  extension/            Vitest unit tests, mirroring src/extension/
examples/               Smoke-test markdown documents
assets/                 Activity Bar icon (SVG), marketplace icon (PNG)
docs/
  PRD.md                Product spec (canonical reference)
  CONTRIBUTING.md       This file
  plan/                 Per-phase implementation plans
.claude/rules/          Path-scoped conventions (auto-loaded by Claude Code when files in those paths are read)
```

The `@/` path alias maps to `src/` everywhere (TS, esbuild, Vite, Vitest). Use it for cross-directory imports within `src/`; same-directory imports stay relative.

## Architecture

The codebase has a hard split between two execution contexts. **Code never crosses this boundary directly — only via `postMessage`:**

- `src/extension/` — Node.js extension host. Has access to the `vscode` API and Node built-ins. Single CJS bundle.
- `src/webviews/` — sandboxed iframe UI. No Node APIs; uses `acquireVsCodeApi()` to message the host. One Vite bundle per webview.

Importing across this boundary will fail to bundle or break at runtime. Path-scoped rules in `.claude/rules/` cover the conventions for each side.

## Tech Stack

- **TypeScript 6** — extension host + webviews
- **esbuild** — bundles the extension host (single `out/extension.js`)
- **Vite 8 (Rolldown)** — bundles webviews (one bundle per webview)
- **Vitest 4** — unit tests for pure-logic services
- **markdown-it** + plugins — Reader markdown pipeline
- **Shiki** (JavaScript regex engine) — code highlighting
- **KaTeX** — math rendering (lazy-loaded)
- **Mermaid** — diagram rendering (lazy-loaded)
- **gray-matter** — frontmatter parsing
- **ignore** — gitignore semantics
- **github-markdown-css** — Reader base styling
- **Prettier + ESLint** + `typescript-eslint` — formatting + linting (auto-format on save)

## Conventions

Formatting is enforced by Prettier + ESLint with format-on-save: double quotes, 4-space indent, semicolons, trailing commas, braces on every control-flow body, `import type` for type-only imports.

For the full product spec see [PRD.md](PRD.md). For per-phase implementation plans see [plan/](plan/).
