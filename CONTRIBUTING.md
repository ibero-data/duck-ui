# Contributing to Duck-UI

Thanks for wanting to help. Duck-UI is maintained by one person with a full-time job, so this guide exists to make sure your effort lands instead of stalling.

## The short version

1. **Open an issue before writing code** for anything bigger than a typo or an obvious small bug fix. Describe the problem and your intended approach. This is the single best way to avoid wasted work.
2. Keep PRs **small and focused**. One fix or one feature per PR.
3. Every bug fix needs a **regression test**. Every feature needs at least a happy-path test.
4. Don't refactor code you aren't touching, and don't swap out tooling (build system, linter, formatter). PRs that rewrite project infrastructure without prior discussion will be closed.

## Dev setup

```bash
bun install        # npm works too, bun is preferred
bun run dev        # http://localhost:5173
```

Before pushing:

```bash
bun run build          # tsc -b + vite build — the real check, CI runs this
bun run lint           # errors fail CI, warnings don't
bun run format:check   # Prettier, gates CI
bun run test           # Vitest
```

Run all four. `bun run typecheck` alone is not enough; some errors only surface in the full build.

## Project layout

- `src/store/` — single Zustand store, one slice per domain. Types in `src/store/types.ts`.
- `src/services/duckdb/` — DuckDB WASM, OPFS, and external-connection layers.
- `src/services/persistence/` — IndexedDB persistence, repositories, crypto.
- `src/lib/` — shared utilities (share codec, SQL sanitization, app config, Duck Brain providers).
- `src/components/` — UI. shadcn/ui primitives live in `src/components/ui/`.
- Tests live in `__tests__/` directories next to the code they test, named `*.test.ts`.

More detail in `CLAUDE.md` and the README architecture section.

## Code conventions

- TypeScript strict mode, no `any`.
- Named exports over default exports.
- Tailwind for styling; no custom CSS unless there's no other way.
- Keep new files under ~500 lines. If your change makes a file bigger than that, split it.
- Escape all SQL values through `sqlEscapeString` / `sqlEscapeIdentifier` (`src/lib/sqlSanitize.ts`). Never interpolate user input into SQL directly.
- Unused variables are prefixed with `_`.

## Commits

Conventional commits: `type(scope): description`

```
fix(grid): render DECIMAL columns with correct scale
feat(brain): show token estimate before sending
```

## Reporting bugs

Include the query or file that triggers it, what you expected, what happened, browser and version, and whether you're on the hosted demo, Docker, or a local build. A screenshot of the console helps.

## What gets merged fast

Fixes with a failing-then-passing test, features that were discussed in an issue first, and anything on a `good first issue` label. Fast, in this repo, is often same-day.
