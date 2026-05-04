---
paths:
    - "**/*.ts"
---

# TypeScript conventions

Formatting (quotes, indent, semicolons, trailing commas, brace placement) is enforced by Prettier + ESLint with format-on-save. Don't fight the formatter — if a manual style choice keeps getting reverted, that's the answer.

## Imports

- Cross-directory imports within `src/` use the `@/` alias mapping to `src/`: `@/extension/nexus/service`. Same-directory imports stay relative (`./parse`).
- Type-only imports must use `import type` — the `consistent-type-imports` ESLint rule auto-fixes this.
- **Never import across the extension/webview boundary.** `src/extension/` and `src/webviews/` are bundled separately and run in different contexts (Node vs sandboxed iframe). An import from one to the other will either fail at runtime or quietly break the bundle.

## What not to write

- **No defensive code for impossible conditions.** Trust internal callers and type-guaranteed inputs. Validate at system boundaries (user input, FS, external APIs) only — not at every function entry.
- **No comments restating what the code does.** Add a comment only when the WHY is non-obvious: a hidden constraint, a workaround for a bug, surprising behavior. If removing the comment wouldn't confuse a future reader, don't write it.
- **No premature abstractions.** Three similar lines is better than the wrong helper. Wait for a third concrete use case before extracting.
