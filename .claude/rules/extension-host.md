---
paths:
    - "src/extension/**/*.ts"
---

# Extension host conventions

This is the Node.js side of the extension. Files here are bundled into a single CJS file (`out/extension.js`) by esbuild and run inside VS Code's extension host process.

## VS Code API surface

- **Stable APIs only.** No `proposedApi` flags. The `.vsix` is intended to run unmodified in Cursor and Windsurf, which only ship stable APIs.
- Prefer `vscode.workspace.fs` over Node's `fs` for workspace file operations — the former works in remote/SSH contexts and abstracts URI schemes; the latter doesn't.
- Use `vscode.Uri` consistently. Don't mix with raw fs paths in flight — convert at boundaries.

## Lifecycle and disposal

Anything that allocates resources (event subscriptions, file watchers, status bar items, webview panels, emitters) must be tracked and disposed. Two acceptable patterns:

- Push to `context.subscriptions` for automatic disposal on extension deactivate.
- Implement `vscode.Disposable` and let the caller manage it.

File watchers (`createFileSystemWatcher`) fire frequently during bulk operations like `git checkout`. Debounce events at the consumer (~100ms is the existing convention in `CortexExplorerProvider`). Cache parsed data keyed on mtime — see `FrontmatterService` for the pattern.

## Isolation from webviews

Never import anything from `src/webviews/`. Webview code runs in a sandboxed iframe with no Node APIs and is bundled separately by Vite — pulling it into the host bundle will fail. Communicate with webviews exclusively through `webview.postMessage` and `webview.onDidReceiveMessage`.
