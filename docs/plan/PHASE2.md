---
title: Phase 2 Implementation Plan
---

# Cortex — Phase 2 Implementation Plan

> **Status:** ✅ Shipped as v0.1.0. Retained as a historical record of the plan; the current product surface is described in [`PRD.md`](../PRD.md).

## Context

[`PRD.md`](../PRD.md) specifies **Cortex**, a VS Code extension that turns any workspace folder into a local-first, GitHub-compatible markdown knowledge base. Phase 1 (see [`PHASE1.md`](PHASE1.md)) shipped the sidebar, file tree, nexus discovery, multi-root switching, ignore + frontmatter filtering, index-file merging, and a placeholder Reader (raw `<pre>` content).

This document covers **Phase 2 only** (PRD §13): the real markdown rendering pipeline. By the end of Phase 2, single-clicking a file in the Cortex Explorer should open a Reader tab that renders the document with **GitHub fidelity** — GFM extensions, callouts, code highlighting, math, diagrams, image resolution, internal link navigation, and live re-render on edits.

What this phase **does not** include (deferred):

- Document type configuration (custom `type` enumerations, status validation, color/icon mapping). Captured separately as Phase 2.5.
- Backlinks panel + link graph (Phase 3).
- Graph view (Phase 3).
- Source ↔ Reader scroll sync (deferred indefinitely; revisit if missed).
- Focus mode toggle, New File frontmatter scaffolding, full `cortex.*` settings surface (Phase 4).
- Toolbar breadcrumb + "three-dots" overflow menu (reveal in explorer, copy link). Captured as a Phase 2 follow-up; not blocking.

---

## Locked Decisions for Phase 2

1. **markdown-it plugin set:**
    - GFM tables, strikethrough, autolinks (markdown-it core / preset).
    - `markdown-it-task-lists` — `[ ] / [x]` checkboxes (rendered, non-interactive).
    - `markdown-it-footnote` — `[^1]` syntax.
    - `markdown-it-emoji` — `:smile:` shortcodes.
    - `markdown-it-github-alerts` — `> [!NOTE|TIP|IMPORTANT|WARNING|CAUTION]` callouts.
    - `@vscode/markdown-it-katex` — math via KaTeX (Microsoft's package; matches VS Code's own preview behavior).
2. **Shiki theming:** simple two-theme switch (`github-light` + `github-dark`) keyed off `vscode.window.activeColorTheme.kind`. No conversion of the user's actual VS Code theme. Rationale: GitHub-fidelity is the explicit goal; the user's editor colors already show in the source editor.
3. **Base CSS:** the `github-markdown-css` npm package, plus a thin overlay (`overlay.css`) that re-points GitHub's hardcoded colors to `--vscode-*` variables for theme-tracking.
4. **Mermaid + KaTeX bundling:** **lazy-loaded** via dynamic `import()`. Most documents have neither math nor diagrams, and both libraries are heavy (~1MB each). Vite is configured to code-split them into separate chunks.
5. **Internal link navigation:** mini-browser model. The Reader tab maintains its own history; back / forward / reload buttons on the toolbar. External `https?://` links open in the system browser via `vscode.env.openExternal`. Anchor `#heading` scrolls in-page or navigates + scrolls.
6. **Live re-render:** triggered by `vscode.workspace.onDidChangeTextDocument` for the currently-rendered file. Debounced 150ms. **Scroll position is preserved** across same-document re-renders. Internal navigation resets scroll to top of new doc; back / forward restore prior scroll.
7. **Frontmatter handling:** stripped from rendered output. The `title` field is **not** rendered as a synthetic `<h1>` — it is used only as the Reader tab title (already in Phase 1) and as the Cortex Explorer node label. Rendered HTML begins with the metadata strip, then the body.
8. **Metadata strip layout:** between the document head and the rendered body, single row that wraps. Phase 2 renders `tags` as `#chip` chips, `type` and `status` as filled badges (plain text, no colour mapping or validation). Doc-types config + colour/icon mapping is Phase 2.5.
9. **Toolbar:** Back, Forward, Reload, Edit Source. Breadcrumb + overflow menu (reveal in explorer, copy link) deferred — recorded as a Phase 2 follow-up.
10. **Error handling:** render-anyway. Mermaid parse failure → keep the source as `<pre>` plus a small inline error indicator. KaTeX syntax error → render the raw `$...$` source unchanged. Image not found → browser default broken-image icon. File with no/invalid frontmatter → render as plain markdown, no metadata strip.
11. **Soft size limit:** **500 KB raw bytes**. Above threshold, the Reader shows a plain `<pre>` truncated to the first 50 KB plus a notice and a **Render anyway** button that bypasses the limit for that document. Threshold hard-coded in Phase 2; promoted to a `cortex.reader.softSizeLimit` setting in Phase 4.
12. **Testing:** new pure-logic services get Vitest unit tests:
    - Link classification + resolution (relative `.md` vs anchor vs external).
    - Frontmatter metadata picker (extract `tags`, `type`, `status`).
    - History stack push / back / forward.
      VS Code-API-bound code (provider, watchers, message handlers) verified manually in the Extension Development Host.

---

## Stage 0 — Webview Scaffold Reset

**Goal:** the existing placeholder Reader is replaced by a multi-module webview foundation. `pnpm build` succeeds. The Reader still opens a tab, but now ships through the new pipeline (basic markdown-it call, no plugins, no styling).

### Files

```
src/webviews/reader/
├── index.html              # mount point (existing — minor updates)
├── main.ts                 # entry: handshake, init/update routing
├── render.ts               # markdown-it instance + plugin registration
├── messaging.ts            # typed host↔webview message contracts (mirror in extension/)
└── styles/
    └── base.css            # placeholder; populated in Stage 1

src/extension/reader/
├── provider.ts             # existing; will be heavily reworked through Phase 2
└── messaging.ts            # typed message contracts (matches webview side)
```

### Tasks

- Add deps: `markdown-it`, `@types/markdown-it`. Pin major versions.
- Define the message protocol in shared `messaging.ts` files (one in `src/extension/reader/`, one in `src/webviews/reader/` — same shape, separate files because they cross the bundle boundary).
- `main.ts` posts `{ type: "ready" }`, awaits `{ type: "init", content }`, calls `render(content)` and writes the HTML into `#content`.
- `render.ts` exports `renderMarkdown(source: string): string` — bare `markdown-it()` for now.
- Provider posts `init` instead of using the Phase 1 `<pre>` fallback.

### Acceptance

- Open any titled `.md` from the Cortex Explorer. The Reader tab renders the markdown as HTML (no styling yet, no plugins, no code highlighting).
- Frontmatter still leaks into the rendered output (will be fixed in Stage 1).
- `pnpm typecheck`, `pnpm lint`, `pnpm test` clean.

---

## Stage 1 — Core Markdown Pipeline + Styling

**Goal:** rendering matches GitHub for the static feature set. Everything but code highlighting, math, diagrams, internal navigation, and live updates.

### Files

```
src/webviews/reader/
├── render.ts               # full plugin stack
└── styles/
    ├── base.css            # imports github-markdown-css
    └── overlay.css         # vscode CSS variable bridges
```

### Tasks

- Add deps: `markdown-it-task-lists`, `markdown-it-footnote`, `markdown-it-emoji`, `markdown-it-github-alerts`, `github-markdown-css`. All as runtime deps of the webview bundle (Vite handles them).
- Configure markdown-it:
    - `html: false`, `linkify: true`, `breaks: false`, `typographer: false` (GitHub doesn't smart-quote).
    - Register all five plugins.
- Strip frontmatter before rendering. Use `gray-matter` on the host side and ship only the body to the webview, plus the parsed frontmatter as a separate field on the message.
- `base.css` imports `github-markdown-css/github-markdown.css`; `overlay.css` overrides hardcoded GitHub colors to use `--vscode-editor-background`, `--vscode-editor-foreground`, etc., so the Reader tracks the user's theme.
- `index.html` body wrapped in `<article class="markdown-body">` per github-markdown-css convention.
- Theme variant selection: `<body data-theme="light|dark">`, set on init from the host-supplied theme kind.

### Acceptance

- Render a stress-test doc containing tables, task lists (rendered, not interactive), strikethrough, autolinks, footnotes (with back-references), emoji shortcodes, all five callout kinds, blockquotes, lists, and images (broken icons fine for now). Visual fidelity is close to github.com.
- Switching VS Code between a light and dark theme flips the Reader's background/foreground colors. (Code blocks remain unstyled — Stage 2.)
- Frontmatter no longer appears in the rendered body.

---

## Stage 2 — Code Highlighting (Shiki)

**Goal:** code blocks render with `github-light` / `github-dark` Shiki themes, switching with the host theme.

### Files

```
src/webviews/reader/
├── highlight.ts            # Shiki initialization, theme switching
└── render.ts               # wires markdown-it's `highlight` option to Shiki
```

### Tasks

- Add dep: `shiki` (v3+).
- `highlight.ts` lazy-initializes a Shiki highlighter loaded with the two GitHub themes and a curated language list (start with: typescript, javascript, json, bash, python, html, css, markdown, yaml, rust, go, sql, diff). Languages can be added later.
- Hook markdown-it's `options.highlight` to `highlight.ts`'s sync render. (Shiki's renderer is sync once the highlighter is initialized.)
- Host detects `vscode.window.activeColorTheme` and includes `themeKind: "light" | "dark" | "high-contrast" | "high-contrast-light"` in `init`. High-contrast variants map to the corresponding light / dark Shiki theme.
- Listen to `vscode.window.onDidChangeActiveColorTheme`; emit `{ type: "themeChanged", themeKind }` to the open Reader. Webview re-renders code blocks with the new theme without re-rendering the whole document (or, simpler for v1, just re-runs the full render — measure first).

### Acceptance

- Code blocks render with GitHub-style colors.
- Toggling VS Code between light / dark themes updates the Reader's code blocks within ~200ms.
- A code block with an unknown language tag renders unhighlighted (no exceptions thrown).

---

## Stage 3 — Frontmatter Metadata Strip

**Goal:** `tags`, `type`, `status` from the frontmatter render as a strip above the document body. No validation, no color mapping, no doc-types config — that's Phase 2.5.

### Files

```
src/webviews/reader/
├── metadata.ts             # extract + render the strip
└── styles/strip.css        # chip / badge styles (theme-aware)
```

### Tasks

- New pure function `pickMetadata(frontmatter)` returns a structured `{ tags?: string[], type?: string, status?: string }`. Unit-tested in `tests/webviews/reader/metadata.test.ts` (or `tests/extension/...` if the function lives host-side; decide during scaffold based on where parsing happens).
- Webview's `main.ts` injects the strip's HTML before the markdown-rendered body. If all three fields are absent, no strip is rendered.
- Layout: flex row, wraps. `type` and `status` rendered as filled badges (plain neutral background — no per-type colors yet). `tags` rendered as `#tag` chips with a slightly different visual.
- Strip styles use `--vscode-*` variables for backgrounds and borders so it tracks the theme.

### Acceptance

- A doc with `title: ...`, `tags: [a, b]`, `type: task`, `status: in-progress` renders the strip with two badges and two chips.
- A doc with only `title` renders no strip.
- Strip never appears for files with invalid / missing frontmatter (those don't reach the Reader anyway per Cortex's rules, but defensive: don't crash).

---

## Stage 4 — Image Resolution

**Goal:** `<img src="./screenshot.png">` and other relative image paths load correctly inside the webview.

### Files

```
src/extension/reader/
├── provider.ts             # localResourceRoots + base URI on init
└── links.ts                # path resolution helpers (host-side)

src/webviews/reader/
└── render.ts               # markdown-it renderer rule for image src rewriting
```

### Tasks

- Provider sets the panel's `localResourceRoots` to the active nexus root URI.
- Provider includes `baseUri` (the current document's directory, converted via `webview.asWebviewUri`) in `init` and `navigateTo` messages.
- Webview's render registers an override for the image rule: rewrites `./relative` and `relative` (no-leading-slash) `src` values by joining against the supplied `baseUri`. Absolute `https?://` and `data:` URLs pass through unchanged. Anything that fails to resolve is left as-is — the browser shows the broken-image icon.
- The same rewriting applies to images embedded by markdown-it's main parse, and to any future inline-HTML allowed (none yet — `html: false`).

### Acceptance

- A doc containing `![diagram](./assets/arch.png)` renders the actual image in the Reader.
- Same image works from a doc nested several folders deep (the `baseUri` is the doc's directory, not the nexus root).
- An image referencing a file outside the nexus root fails gracefully (browser broken-image icon, no JS exception).

---

## Stage 5 — Internal Link Navigation + Toolbar

**Goal:** clicking a link in the Reader navigates within the same tab. Back / Forward / Reload / Edit Source toolbar buttons function.

### Files

```
src/webviews/reader/
├── nav.ts                  # link click interception, history stack
├── toolbar.ts              # button wiring + render
└── styles/toolbar.css

src/extension/reader/
├── links.ts                # classify + resolve link hrefs
└── provider.ts             # handle linkClicked messages
```

### Tasks

- Webview's `nav.ts`:
    - Delegates click events on `<a>` elements at the document root.
    - Classifies hrefs locally where possible: `#anchor` (same-page scroll), `https?://` (external — post `linkClicked` to host), otherwise `linkClicked` to host with the href.
    - Maintains a history stack `{ uri, scrollY }[]` plus a cursor index for back / forward.
    - On host `navigateTo`, replaces the current document content and pushes onto history.
    - On back/forward, pops/pushes the cursor and asks the host for that URI's content.
- Host's `links.ts`:
    - `resolveLink(href, currentUri, nexusRoot)` returns `{ kind: "external", url } | { kind: "internal", uri, anchor? } | { kind: "anchor", id } | { kind: "outside-nexus" }`. Pure function, unit-tested.
    - For `internal`, host reads the target file, parses frontmatter, posts `navigateTo` with content + parsed frontmatter + new baseUri.
    - For `external`, host calls `vscode.env.openExternal(Uri.parse(url))`. The Reader stays on the current doc.
    - For `outside-nexus` (link points outside the nexus root), host falls back to opening the file in a normal editor; Reader stays put.
- Toolbar lives in the webview (HTML + JS). Buttons:
    - **Back** — disabled when at the start of history.
    - **Forward** — disabled when at the end.
    - **Reload** — re-fetches the current doc from the host and re-renders.
    - **Edit Source** — posts `openSource` (existing Phase 1 behavior).
- Provider's `init` payload includes the initial `baseUri` and any anchor to scroll to after render.

### Acceptance

- Clicking `[other doc](./notes/other.md)` in the rendered HTML navigates the Reader to that file.
- Back returns to the previous doc; the previous scroll position is restored.
- Clicking `[github](https://github.com)` opens the system browser; the Reader stays on the current doc.
- Clicking `[same-page anchor](#installation)` scrolls without re-rendering.
- Clicking `[other file](./other.md#section)` navigates and scrolls to the heading after render.

---

## Stage 6 — Live Re-render

**Goal:** while a Reader tab is open, edits to the source file update the Reader live.

### Files

```
src/extension/reader/
└── provider.ts             # source-change watcher + debounce
```

### Tasks

- When the Reader opens a doc, subscribe to `vscode.workspace.onDidChangeTextDocument` filtered to that URI. Also listen to `onDidSaveTextDocument` to handle external changes (e.g. from `git checkout`).
- Debounce 150ms. On flush, post `{ type: "update", content, frontmatter }`.
- Webview's `main.ts` saves the current `window.scrollY` before swapping content, restores it after the new render commits. (Best-effort: if the document length changed dramatically the absolute scroll position may not align perfectly. Acceptable for v1.)
- Unsubscribe when the Reader navigates away from the doc or the panel is disposed.
- Edge: if a re-render lands while Mermaid blocks are still rendering from a previous pass, cancel the in-flight Mermaid renders.

### Acceptance

- Open a doc in the Reader, then edit the source in a side editor. Changes appear in the Reader within ~200ms.
- Editing in a long doc preserves the reader's scroll position (within a line or two of where it was).
- Switching the Reader to a different doc cancels the watcher for the previous one.

---

## Stage 7 — Math (KaTeX, lazy)

**Goal:** docs with math render correctly; docs without math don't pay the bundle cost.

### Files

```
src/webviews/reader/
└── math.ts                 # lazy KaTeX setup
```

### Tasks

- Add dep: `@vscode/markdown-it-katex` (which depends on `katex`).
- Vite config: ensure `katex` ends up in its own chunk via dynamic `import()`.
- `math.ts` exports an async `enableMath(md)` that imports both the plugin and KaTeX's CSS, then registers the plugin on a markdown-it instance.
- `render.ts` checks for `$` characters in the source. If present, awaits `enableMath()` before rendering. (Cheap heuristic — false positives in code blocks are fine; markdown-it-katex won't match in fenced code.)
- KaTeX CSS only loaded once per Reader session (cached at module scope).

### Acceptance

- A doc containing `$E = mc^2$` and `$$\int_0^\infty e^{-x} dx = 1$$` renders both inline and block math.
- A doc with no math doesn't load KaTeX (verify in the network panel of the developer tools).
- A doc with malformed math renders the raw source unchanged, no exception.

---

## Stage 8 — Diagrams (Mermaid, lazy)

**Goal:** ` ```mermaid ` blocks render as diagrams; mermaid-free docs don't pay the bundle cost.

### Files

```
src/webviews/reader/
└── mermaid.ts              # post-process mermaid code blocks
```

### Tasks

- Add dep: `mermaid` (v11+). ESM imports.
- markdown-it renderer rule for fenced code: when the language tag is `mermaid`, output a `<div class="mermaid-block" data-source="...">` instead of a `<pre><code>...</code></pre>`. The raw source is base64-encoded into the data attribute (HTML-escaping mermaid syntax is fragile).
- After the main render commits, `mermaid.ts`:
    - Queries `.mermaid-block` nodes; if zero, returns immediately.
    - Dynamic-imports `mermaid` and initializes once with `theme: "base"` and the active VS Code theme variables for color overrides (best-effort; falls back to mermaid's default themes if integration is too fiddly — capture as a follow-up).
    - For each block, decodes the source and calls `mermaid.render()`. Replaces the block's content with the resulting SVG. On error, replaces with a `<pre>` of the source plus a small error message and discards the SVG.
- Cancellation: a re-render that arrives mid-mermaid-render aborts pending renders by checking a generation counter before swapping each SVG.

### Acceptance

- A doc with two `mermaid` blocks renders both as SVG diagrams.
- A doc with no mermaid blocks doesn't load `mermaid` (verify in network panel).
- A doc with a syntax-broken mermaid block renders the rest of the doc fine; the broken block shows the source plus an error.

---

## Stage 9 — Soft Size Limit

**Goal:** documents over 500KB don't lock up the Reader.

### Files

- `src/extension/reader/provider.ts` — size check on read.
- `src/webviews/reader/main.ts` — fallback rendering branch.

### Tasks

- Provider reads file size before reading content. If over 500KB, sends `{ type: "init", mode: "oversized", preview, sizeBytes }` instead of the normal `init`.
- `preview` is the first 50KB decoded as UTF-8 (truncated mid-byte on a code-point boundary if necessary).
- Webview renders a notice (`Document is N MB; rendered as plain text. Render anyway?`), the truncated preview in a `<pre>`, and a button.
- Clicking the button posts `{ type: "forceRender" }`. Provider re-reads the full file and sends a normal `init`. The Reader re-renders through the full pipeline.

### Acceptance

- A 5MB markdown file opens immediately as a notice + truncated preview.
- Clicking **Render anyway** brings up the full pipeline and renders (slowly is OK).
- A 100KB file renders normally (below the limit).

---

## Stage 10 — Verification & Packaging

**Goal:** Phase 2 is shippable as a `.vsix`.

### Tasks

- Smoke-test against a real knowledge-base structure: at least one doc with every supported feature (callouts, code, math, mermaid, footnotes, emoji, internal + external + anchor links, images, tags + type + status frontmatter, oversized file).
- Update `README.md`: roadmap row for Phase 2 → Done; commands list (no new user-facing commands in Phase 2, but the Reader is now functional); update screenshots if any.
- Update `package.json` version to `0.1.0` (first non-trivial release).
- `pnpm package` produces a clean `.vsix`. Sideload in VS Code, Cursor, and Windsurf; verify in each.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` all clean. Test count grew by the new pure-logic suites.

### Acceptance

- All boxes above checked.
- Manual test plan executed on the smoke-test doc set.
- The `.vsix` is one short bundled artifact suitable for handing to a beta tester (or daily-driving).

---

## Decisions Deferred to Implementation Time

- **Shiki language list scope:** start with the curated list in Stage 2. Adding a language is one line and a tiny grammar download — defer the "which languages?" debate until something is actually missing in real use.
- **Mermaid theme integration:** v1 ships with `theme: "base"` and best-effort color overrides keyed off `--vscode-*` variables. If the result looks bad, fall back to mermaid's `default` / `dark` themes selected by host theme kind. Don't block Phase 2 on a perfect match.
- **Theme-change strategy in Stage 2:** full document re-render on theme change is the default. If it feels slow in practice (>200ms for a typical doc), switch to an incremental Shiki re-highlight pass. Don't pre-optimize.
- **Scroll-restore granularity in Stage 6:** byte-anchor mapping is overkill; same-line restore is unattainable without source-line mapping. We restore raw `scrollY` and accept jitter when document length changes significantly.

---

## Known Limitations Carried Out of Phase 2

- **Document type config.** `type` and `status` render as plain text badges; there is no validation, no per-type color, and no per-status icon. The doc-types config + validation is Phase 2.5.
- **Toolbar polish.** No breadcrumb, no overflow menu (reveal in explorer / copy link). Tracked as a Phase 2 follow-up.
- **Source ↔ Reader scroll sync.** Not implemented; deferred indefinitely.
- **GitHub-flavored autolinks for `#123` / `@user`.** Out of scope per PRD §3.2.
- **Drag-and-drop file moves with link rewriting.** Phase 4 stretch.
- **Search inside the Reader.** Browser-default `Ctrl/Cmd+F` works; no Cortex-specific search yet.
- **Settings.** `cortex.reader.softSizeLimit` etc. are not exposed yet — values are hard-coded. Settings surface lands in Phase 4.

---

## Phase 2 Definition of Done

A user opens any titled `.md` file in the Cortex Explorer and the Reader tab:

1. Renders the document with GitHub-fidelity markdown — tables, task lists, strikethrough, autolinks, footnotes, emoji, callouts, code (Shiki-highlighted), math (KaTeX), and Mermaid diagrams.
2. Shows a metadata strip when `tags`, `type`, or `status` are present in frontmatter (no validation yet).
3. Resolves relative image paths against the document's directory.
4. Navigates within the same tab when an internal `.md` link is clicked, with working back / forward / reload / edit-source toolbar buttons.
5. Re-renders live (≤200ms after debounce) when the source is edited, preserving scroll position.
6. Falls back to a notice + truncated preview for files over 500KB, with a "render anyway" override.
7. Tracks the user's VS Code theme (light / dark / high-contrast variants).

The pipeline is built into a runnable `.vsix` that installs into VS Code, Cursor, and Windsurf and survives a smoke-test pass on the canonical test doc set.
