---
paths:
    - "tests/**/*.ts"
---

# Testing conventions

Tests live under `tests/` mirroring the source tree. A test for `src/extension/frontmatter/parse.ts` goes in `tests/extension/frontmatter/parse.test.ts`. They run via Vitest (`pnpm test`, `pnpm test:watch`).

## What to test

- **Pure logic only.** Services with no VS Code API dependency: `parseFrontmatter`, `pickActive`, `buildMatcher` / `isIgnored`. These should have thorough unit coverage.
- VS Code API-dependent code (services that wrap workspace APIs, tree providers, webview providers) is currently verified manually until a proper integration test harness exists. **Don't mock `vscode`** — it leads to brittle tests that pass while production behavior breaks.

When a service mixes pure logic with API calls, split the pure part into a separate file and unit-test that. The API-touching wrapper stays uncovered. `frontmatter/parse.ts` (pure) + `frontmatter/service.ts` (API wrapper) is the canonical example.

## Imports

- Source under test: `import { parseFrontmatter } from "@/extension/..."`. The `@/` alias is wired through `vitest.config.ts`.
- For VS Code types in tests, `import type * as vscode from "vscode"` is fine — type-only imports don't need a runtime resolution.

## Style

- Test files end in `.test.ts`.
- One `describe` per exported symbol; one `it` per behavior. Test names should read as English sentences (`"returns null when title is missing"`).
- No setup/teardown for pure functions — call them directly with inputs.
