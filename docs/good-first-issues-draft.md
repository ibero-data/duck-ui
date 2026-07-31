# Good-first-issue drafts

Paste these as GitHub issues and label them `good first issue` before launch traffic arrives. Each is real, scoped, and verified against the current code.

---

**Title: Add aria-labels to icon-only buttons**

Several icon-only buttons have no accessible name (screen readers announce them as just "button"). Examples: the sidebar toggle buttons, the tab-close X buttons in `WorkspaceTabs`, the explorer refresh button's siblings, and several buttons in the results-table toolbar. Grep for `size="icon"` and `<Button` with only an icon child, and add a short `aria-label` to each. `DataExplorer`'s "Data menu" trigger shows the pattern.

---

**Title: Add ARIA roles to the explorer tree items' children**

The explorer tree container has `role="tree"` and top-level `role="treeitem"`, but column nodes (`ColumnNode.tsx`) and expanded children don't participate in the tree semantics (no `role="treeitem"`, no `aria-expanded` on expandable columns). Keyboard and screen-reader users can't navigate the hierarchy properly.

---

**Title: Add an .env.example documenting build-time variables**

There's no `.env.example`. Add one listing the `DUCK_UI_*` build-time variables from the README's Configuration section with one-line comments, so local setups don't need to reverse-engineer `vite.config.ts` and `inject-env.js`.

---

**Title: Remove dead code: TopBar.tsx and use-toast.ts**

`src/components/layout/TopBar.tsx` and `src/hooks/use-toast.ts` (if still unreferenced — verify with a grep first) are not imported anywhere. Remove them and any orphaned imports.

---

**Title: TIME columns with sub-second precision lose trailing zeros inconsistently in exports**

`timeCellToString` trims trailing zeros from fractional seconds for display ("12:34:56.5" instead of "12:34:56.500000"). CSV/JSON exports reuse the display string. Decide and document one canonical form for exports (probably full precision), add a unit test in `src/services/duckdb/__tests__/resultCoercion.test.ts`.

---

**Title: Show a hint when a query returns 0 rows**

A successful query with no rows renders the bare "No data available." message, which reads like an error. Show something friendlier for the success case, e.g. "Query ran fine — 0 rows returned (took 12ms)". The distinction is available in the tab's `result` (no `error`, `rowCount === 0`).
