---
paths:
    - "src/webviews/**/*.ts"
    - "src/webviews/**/*.css"
    - "src/webviews/**/*.html"
---

# Webview conventions

This is the iframe-sandboxed UI side. Files here are bundled per webview by Vite into `out/webviews/<name>/<name>.{js,css}` and loaded into a `WebviewPanel` by the extension host.

## Environment

- **No Node APIs.** `Buffer`, `fs`, `path`, `process`, `require` — none of it is available. Treat this as browser code.
- DOM is available. Standard browser globals (`window`, `document`, `fetch`) work.
- The host-side VS Code API is accessed via `const vscode = acquireVsCodeApi()` — **never** `import * as vscode from "vscode"` (that's the host-only import and will fail to bundle).

## Resource loading and CSP

- The webview's Content Security Policy restricts `script-src` to a per-panel nonce plus `webview.cspSource`. Inline `<script>` won't run; everything goes through the bundled module.
- Asset URIs (images, fonts, etc.) must be passed in from the host, converted via `webview.asWebviewUri()`. Hardcoded `file://` or `https://` paths will be blocked.
- Theme colors come through CSS custom properties prefixed `--vscode-*` (e.g. `--vscode-editor-foreground`). Use those rather than hardcoded values so the webview tracks the user's theme automatically.

## Messaging

All host communication is via `postMessage`. The handshake convention:

- Webview posts `{ type: "ready" }` once mounted.
- Host responds with `{ type: "init", ... }` containing initial state.
- Subsequent updates use other `type` values (e.g. `update`, `themeChanged`).

Agree on a `type` discriminator for every message; type the handlers loosely on both sides since `postMessage` payloads aren't statically checkable.

## Isolation from the extension host

Never import anything from `src/extension/`. That code is Node-only and pulls in the host `vscode` namespace, which doesn't resolve in the webview bundle.
