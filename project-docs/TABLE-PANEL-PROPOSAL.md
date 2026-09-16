# TablePanel — Visual Design, Formatting, Interaction & Scale

**Status: PART A (§6 Option B + the `formatValue.ts` fix) is IMPLEMENTED, verified live (both themes) and covered by a new, passing, stable Playwright spec (`tests/integration/tablePanelOptionB.spec.ts`) and new Vitest cases (`tests/unit/formatValue.test.ts`) — see the per-item status notes inline in §6 and §2. PART B (§5's query-architecture question) remains RESEARCH + PROPOSAL ONLY, per direct, explicit instruction — real, measured numbers now exist (§5e/§5f), but no query-architecture code was changed.** Every "Do not" rule in `CLAUDE.md`, every already-shipped feature (`005`/`019`/`029`/`034`/`050`/`060`), and every rule in the `wftdm-design-system` skill remains in force. This mirrors the research-only process already used for `project-docs/UX-REDESIGN-PROPOSAL.md` (sidebar navigation) and `project-docs/BASEMAP-PICKER-PROPOSAL.md` (basemap tab picker) for the parts that are still research-only.

**Date:** 2026-09-16 (§§1–3 and §6/§7 are the original research pass; §§4–5 are a same-day second research pass re-examining the UI-library question against a second candidate and the underlying query-architecture question at real WFRC scale; §5e/§5f are a same-day third pass — real, measured latency numbers against a real, synthetic dataset at the actual stated scale, through the real production DuckDB-WASM engine — requested specifically to close the "no measured number" gap the second pass's own §9 left open. §6 Option B and the `formatValue.ts` fix (§2) were then implemented, per direct instruction, in this same session. §8's Recommendation and §9's open-items list are updated to synthesize all three research passes and the implementation.)
**Scope:** the `table` panel type (`src/panels/TablePanel.tsx` + `src/panels/tableLogic.ts` + `src/panels/formatValue.ts` + `src/components/ui/dropdown-menu.tsx`), plus the query layer §5 evaluates (`src/panels/panelQuery.ts`, `src/services/duckdb.ts`'s `query()`) without changing it. Not any other panel type. No change to the `dashboard-*.yaml` grammar's `columns:`/`sort:`/`pagination:`/`searchable:` shape.

---

## 1. What was researched, and how it was weighted

| Source | What it's good evidence for | How it was used here |
|---|---|---|
| **`ui.shadcn.com/docs/components/data-table`** (fetched directly) | shadcn's own real, current guidance for exactly this component. Confirmed directly: shadcn's `<Table>` primitive is a **thin, unstyled wrapper** ("if we combine all of these variations into a single component, we lose the flexibility that headless UI provides"); **all** sorting/filtering/column-visibility/pagination behavior comes from pairing it with **`@tanstack/react-table`**, a separate, required dependency (`pnpm add @tanstack/react-table`); the column-visibility pattern shown is a `DropdownMenu` of `DropdownMenuCheckboxItem`s behind a `Settings2` icon trigger. | The primary counterpart evidence for §3's central question — this app's own PRIMARY design reference (`wftdm-design-system` skill) recommends adopting exactly this dependency for exactly this feature. Quoted precisely, not paraphrased loosely. |
| **`gropaul/dash-ui`'s real `src/components/relation/table/` tree** (fetched directly — `table-column-head.tsx`, `column-dropdown-content.tsx`, `content-select-columns.tsx`, `table-footer.tsx`, `column-head-sorting-icon.tsx`) | The closest real analog this project already treats as authoritative (cited in `PIPELINE.md`, and directly for the `036`/`037` Scenarios-tab redesign and the `024` view-mode-picker research) — a genuine DuckDB-native data-browsing tool, not a generic CRM/admin-panel table. Confirmed directly: it does **not** use `@tanstack/react-table` at all. Column drag-reorder is hand-built on **`@dnd-kit/sortable`** (already a direct dependency of this app, `037-scenarios-tab-redesign`); column resize is a hand-rolled pointer-drag handle; column-visibility is a per-column right-click-style `DropdownMenu` ("Hide Column" / "Hide other Columns" via a `cmdk`-based searchable submenu); sort indicators are `lucide-react`'s `ArrowUp`/`ArrowDown`/`ArrowUpDown`, always visible (faint, hover-revealed on an unsorted column), with a small ordinal badge for multi-column sort. | The counter-evidence: a real, mature, same-category tool solves the identical problem set hand-rolled. Used throughout §2/§3/§5 to source concrete, working interaction patterns without inheriting a library. |
| **This app's own `src/panels/TablePanel.tsx`/`tableLogic.ts`/`formatValue.ts`** (read directly, line-by-line) | What is actually built today, vs. assumed from memory or from `005-table-panel`'s original spec. | §2's audit. Found one genuinely significant, currently-shipping bug (§2, finding 1) that is directly in-scope for "formatting" — the exact word in this task's own title. |
| **`public/demo-dashboard-config/*.yaml`** (grepped directly, all 8 files) | Real, currently-published `format:`/`columns:` usage — not GRAMMAR.md's own worked example alone. | Confirmed the formatting bug is live in production demo content (29 real instances, not hypothetical), and confirmed real column counts per table (typically 3–5) — evidence against needing a searchable column picker. |
| **`package.json` / `package-lock.json`** (read directly) | Whether `@tanstack/react-table` (or any `@tanstack/*` package) is already present, directly or transitively. | Confirmed absent. `@tanstack/react-virtual` and `cmdk` ARE present in `package-lock.json` but only as transitive dependencies of `@kanaries/graphic-walker` (verified by tracing the exact dependency block) — not something this app can rely on being present independent of that package's own version. |
| **npm registry + Bundlephobia, live** (`@tanstack/react-table@9.2.4`, current `latest` as of this research) | Real, current bundle-size and dependency-graph numbers, not estimated. | §3's cost side. |
| **`.specify/memory/constitution.md` Principle VI + `CLAUDE.md`'s own `037-scenarios-tab-redesign` entry** (read directly) | This project's own, already-exercised precedent for how a *new, non-visual, headless* dependency is weighed against Principle VI's "no other component library" rule — the exact class of question `@tanstack/react-table` raises. | §3 applies the identical analysis, not a new standard invented for this document. |
| **`wftdm-design-system` skill** (`SKILL.md`, read in full) | The real, current token/typography/icon/spacing rules this panel type must be held to — the same bar `project-docs/BASEMAP-PICKER-PROPOSAL.md` and every shipped panel-type polish pass has used. | §7's audit. |
| **`observablehq/inputs`'s real GitHub source** (`README.md`'s Table section, `src/table.js`, `src/style.css`, `package.json` — fetched directly) | `Inputs.table()`'s real, current, documented API and options; its actual row-rendering mechanism (read from source, not inferred from the docs' own prose); its real CSS (whether it exposes theming hooks or hardcodes values); its real, separate package identity and dependency graph. | §4, in full — every claim there is sourced to a specific file/line quoted or closely paraphrased. |
| **`npm registry`, live** (`@observablehq/plot@0.6.17`'s and `@observablehq/inputs@0.12.0`'s own real `dependencies` fields) | Whether `@observablehq/inputs` ships bundled with, or as a dependency of, `@observablehq/plot` (already installed) — the task's own point 3. | §4c — confirmed they are fully independent packages. |
| **`TanStack/table`'s real GitHub source** (`docs/framework/react/guide/pagination.md`, fetched directly) | TanStack Table's own current, documented contract for `manualPagination`/`manualSorting`/`manualFiltering` — precisely what the library does and does not do in "server-side" mode. | §5c — quoted directly, used to answer the task's own point 4 question about whether this pattern needs any particular library at all. |
| **This app's own `src/panels/panelQuery.ts`/`src/services/duckdb.ts`** (read directly, `buildPanelQuery()`/`query()`) | The real, current query-construction and result-materialization code every table panel actually runs today — whether any row cap, `LIMIT`/`OFFSET`, or streaming already exists. | §5a — confirmed neither exists on the path `TablePanel.tsx` uses. |
| **`project-docs/PIPELINE.md`'s `050-scope-multi-connection` entry** (read directly) | This app's own already-measured, real finding about DuckDB-WASM's single-Worker/single-threaded-engine architecture — directly relevant to whether query-time pagination is "free" just because DuckDB itself is fast. | §5b, quoted directly rather than re-derived from assumption. |
| **A live `duckdb` CLI query against this app's own real, published `public/demo-scenarios/activitysim-baseline/summary/*.parquet` files** | The actual current row-count scale of every real table-bound metric this app ships today, as a baseline against the task's own stated future WFRC scale (~15,000 MAZ rows, "potentially millions" at person/trip level). | §5a — confirmed today's real content (max ~8,200 rows, un-aggregated; every table-bound metric under 3,000) is nowhere near the scale the architectural question is really about. |

---

## 2. Current-state assessment — what TablePanel does today

Read directly from `TablePanel.tsx`, `tableLogic.ts`, `formatValue.ts`, `layout/types.ts`'s `TableColumnConfig`/`TablePanelConfig`, and `project-docs/GRAMMAR.md`'s `type: table` section before writing anything below.

**What's genuinely already built and working** (confirmed directly, not assumed from `005-table-panel`'s original spec — several features referenced only obliquely in later test-migration work are real and current):

- **Sort** — click a column header to sort ascending, click again for descending, click a different column resets to ascending. Numeric columns compare numerically (`typeof === 'number'`), everything else via `localeCompare`. `config.sort` seeds the initial order.
- **Search** — a single case-insensitive substring match evaluated against every column's own *rendered* (formatted) value, gated behind `searchable: true`.
- **Pagination** — client-side, `config.pagination` (default 20 rows/page), Previous/Next text buttons, a "Page X of Y" label.
- **Column color scale** — `color_scale: sequential | diverging` + `domain` on a numeric column, resolved through the shared `tokenDerivedColor()` (also used by `zonemapColor.ts`'s choropleth fill) — a real `color-mix()`-based value, correctly WFRC-token-derived.
- **Baseline diff** (`019-baseline-diff-consumption`) — a `comparison: diff` column renders the computed `diff_value`, `null` diffs render a distinct "N/A", never the literal string `"null"`.
- **Scenario-label substitution** (`035`) — a `scenario`-keyed column's cell values resolve through `label ?? name`, not the raw internal scenario name.
- **Three-way state reset** discipline (`009-scenario-manager` FR-008) — sort/search/page all reset together on a genuine content change, but survive a scenario-activation-only refetch. A real, deliberately-tested piece of state-management correctness, not incidental.
- **Shared empty/error/loading states**, including a genuinely *shaped* loading skeleton (header-row + body-rows, `029`'s Phase 3 work) — not a placeholder rectangle.
- **Keyboard-operable sort** — a real `<button>` per header (not a `<th onClick>`), Tab-focusable, Enter/Space activates it for free. This was itself a real, self-identified accessibility fix during `005`'s own implementation (`TablePanel.tsx`'s own header comment records it) — worth naming because it shows this file already has a track record of catching its own gaps, not just shipping and forgetting.

**What's genuinely missing** — confirmed directly against `TableColumnConfig`/`TablePanelConfig` (`layout/types.ts:121-140`), which has exactly `field`/`label`/`format`/`color_scale`/`domain` at the column level and `columns`/`sort`/`pagination`/`searchable` at the panel level, nothing else:

- **Column-visibility toggling** — confirmed entirely absent, exactly as the task's own framing suspected. No hidden-columns state, no toggle control, no grammar field for an author-configured default.
- **Column reordering** — absent. Column order is whatever `columns:` lists (or `Object.keys(rows[0])` order when `columns:` is omitted).
- **Column resizing** — absent. Every column is `whitespace-nowrap` with no explicit width; the browser's own table auto-layout decides.
- **Multi-column sort** — absent. Clicking a second column's header fully replaces the first sort, never adds a secondary key.
- **Sort-indicator discoverability** — a real, if small, gap: the up/down indicator is a **literal Unicode character** (`' ▲'`/`' ▼'`, string-concatenated directly into the button's text content), not a `lucide-react` icon, and it renders **only on the currently-sorted column** — an unsorted, sortable column gives a viewer no visual cue at all that clicking it does anything, until they click it once and see the label shift.
- **Pagination controls are minimal** — Previous/Next only, no jump-to-first/last, no page-size selector, no "showing 1–20 of 143" phrasing (just "Page 1 of 8").
- **No per-column filter** — search is one global substring match across every column; there's no "filter this column to these values" affordance.
- **No row density option** — one fixed `px-3 py-2` cell padding regardless of row count or viewer preference.

**A real, confirmed, currently-shipping bug found during this research — squarely a "formatting" finding, the task's own named topic:**

`formatValue.ts`'s regex is `/\{:(,)?\.(\d+)(f|%)\}/` — it matches **only** a *braced* Python-style spec, e.g. `"{:,.0f}"`. `project-docs/GRAMMAR.md`'s own worked `type: table` example uses the **bare, unbraced** form instead — `format: ",.0f"` and `format: "+.1%"` — and so does every real table column in the shipped demo content. Verified directly (both by reading the regex and by testing it live against real strings):

```
",.0f"   → regex.test() → false   (real GRAMMAR.md example, real shipped columns)
"{:,.0f}" → regex.test() → true    (what the regex actually requires)
"+.1%"   → regex.test() → false   (GRAMMAR.md's own second example — the leading
                                     `+` sign-forcing flag isn't supported at all,
                                     braced or not)
```

A grep across all eight `public/demo-dashboard-config/*.yaml` files found **29 real, live `format:` strings on real `table` columns using the bare (unbraced) form** — `dashboard-3-tour-models.yaml` alone has 11, `dashboard-6-network.yaml` has 12. Every one of them silently falls through `formatValue()`'s regex-match guard to `return String(value)`, rendering the raw number with no thousands separator and no percent conversion. This is not hypothetical or edge-case: it is the default, documented, most-common way an author writes `format:` on a table column today, and it does not work.

**A real, confirmed correction to this section's own original claim, found during implementation, not assumed**: the sentence that stood here originally said every real `valuebox` panel's braced `format:` string "works correctly." That was wrong in one respect. `formatValue()`'s original implementation discarded **everything outside the matched `{...}` span** — a real, live valuebox format string, `"{:,.0f} mi"`, silently dropped its own `" mi"` suffix entirely (`formatValue(1500.4, '{:,.0f} mi')` returned `"1,500"`, not `"1,500 mi"`), confirmed via a direct Node test before writing the fix. This is a second, real, currently-shipping bug, distinct from but adjacent to the bare-format one, found only once this section's fix was actually being implemented rather than merely proposed — a concrete instance of this project's own repeated experience that a bug found "while otherwise in scope" is worth fixing immediately rather than filed separately.

A third, smaller, related gap: `panels/valueBoxSparkline.tsx` and the `058-hierarchical-chart-panels` tooltip renderers both format numbers via the browser-native `Intl.NumberFormat('en-US')` instead of this hand-rolled mini-parser — this app has **two different, independently-maintained number-formatting conventions** live in `src/panels/`. Not unified here — a real, separate design choice, left as-is.

**STATUS: FIXED.** `formatValue.ts`'s regex now accepts both the bare and braced forms, supports the `+`/`-` sign-forcing flag GRAMMAR.md's own `"+.1%"` example uses (previously unsupported in any form), and splices the formatted number back into the original string at the matched span — preserving any literal prefix/suffix text (closing the `" mi"`-suffix bug too) instead of discarding it. Five new `tests/unit/formatValue.test.ts` cases cover the bare form, sign-forcing (including the `value === 0` and negative-value cases), suffix preservation, and the braced sign-forcing form; all 10 cases in that file (5 original + 5 new) pass, and the full `tests/unit/` suite passes at 500/500. Verified live against real published demo content (`dashboard-3-tour-models.yaml`'s own bare-format `,.0f` "Persons" column) via a new, real, stable Playwright test (`tests/integration/tablePanelOptionB.spec.ts`, cross-checked against a live `duckdb`-CLI-equivalent query through `window.__wftdm.query()` — never a hardcoded expected value) and via direct screenshot in both light and dark mode.

---

## 3. The real decision: adopt `@tanstack/react-table`, or hand-roll the gaps?

This is the central question the task asked to be surfaced with evidence, not assumed either way.

### 3a. What shadcn's own reference actually requires

Confirmed directly from `ui.shadcn.com/docs/components/data-table`: shadcn's `<Table>` is explicitly **not** a data-table component — it is "just the HTML table wrapped with some basic styling." Every piece of behavior this task lists — sorting, filtering, column-visibility, pagination — comes from **`@tanstack/react-table`**, installed as a separate, required dependency. The column-visibility UI shadcn documents is a `DropdownMenu` with one `DropdownMenuCheckboxItem` per hideable column, wired to `column.toggleVisibility(!!value)`, behind a `Settings2`-icon "Toggle columns" trigger.

**If this app followed shadcn's own reference literally, `@tanstack/react-table` is the prescribed path.** That is real, and worth stating plainly before weighing it — `wftdm-design-system`'s own framing is that shadcn is this app's PRIMARY reference, "the most directly authoritative one," not one of several co-equal sources.

### 3b. What it would actually cost — real, current numbers

Confirmed live, not estimated, as of this research (`@tanstack/react-table@9.2.4`, published 2026-08-28, the current `latest` tag):

| | Value | Source |
|---|---|---|
| `@tanstack/react-table` own bundle | 120,827 bytes minified / **31,751 bytes gzipped** | Bundlephobia, live |
| Its own dependency graph | `@tanstack/table-core` (the actual logic — react-table is a thin React binding over it), `@tanstack/react-store` + `@tanstack/store` (a **new internal reactive-state layer**, introduced in the v9 line), `use-sync-external-store` | npm registry `dependencies` field, live |
| Version maturity | v9 is the current `latest`; the long-established v8 line's last real release (`8.20.5`) was **2024-08-24** — v9 represents a real, fairly recent internal rewrite (the `@tanstack/store` state layer didn't exist in v8) | npm registry `time` field, live |
| Present in this app today? | **No** — confirmed absent from `package.json` entirely. `@tanstack/react-virtual` and `cmdk` (a separate, unrelated `@tanstack`-adjacent and shadcn-adjacent package respectively) both appear in `package-lock.json`, but tracing the exact dependency block confirms both are transitive dependencies of `@kanaries/graphic-walker` alone — not something this app can treat as already-present infrastructure; a future graphic-walker upgrade could drop either with zero warning. | `package-lock.json`, read directly |

**The architectural cost, not just the byte count:** `@tanstack/store` is a *second, independent reactive-state primitive* this app would be adopting. This project already has one, consistent, hand-rolled state pattern used everywhere — `state/appState.ts`/`filterState.ts`/`basemapState.ts`/`protomapsSourceState.ts`'s own `subscribe()`/`notify()` shape, wrapped by `useSyncExternalStore`-based hooks (`useActiveScenarios`/`useBaseline`/`useGlobalBasemap`/etc. — this app's own established, working convention, re-derived independently by every one of those hooks rather than pulled from a library). Adopting TanStack Table for `TablePanel.tsx` specifically means one panel type's own internal state (which columns are sorted, hidden, resized) would live inside a *different* state paradigm than every other piece of reactive state in the app — a real, if narrow, consistency cost beyond the raw kilobytes.

### 3c. What it would actually buy — real feature-parity check

TanStack Table's row-model composition (`createSortedRowModel`, `createFilteredRowModel`, `createPaginatedRowModel`, plus built-in column-visibility/sizing/pinning state) genuinely covers **every** gap named in §2 — sort, filter, visibility, pagination, sizing, and (with `@dnd-kit`, its own documented pairing) reordering — in one coherent, actively-maintained package.

But most of what it would replace is **already built, already unit-tested, and already working**: `resolveColumns()`/`filterRows()`/`sortRows()`/`cellColor()` in `tableLogic.ts` are ~120 lines total, each independently Vitest-tested, and correctly handle this app's own real requirements (numeric-vs-locale sort, render-then-search per spec.md's own documented "search what you can see" decision, the `NO_DATA_COLOR`/`tokenDerivedColor()` color-scale integration shared with `zonemapColor.ts`). None of that is generic TanStack behavior this app would get "for free" without first re-deriving it as a custom column-def/cell-renderer layer on top of TanStack's own API — the library doesn't know about WFRC color tokens, `$baseline` diff columns, or scenario-label substitution; all of that stays hand-written regardless of which sort/filter/paginate engine sits underneath it.

### 3d. The closest real precedent this app already treats as authoritative doesn't use it

`gropaul/dash-ui` — cited directly and repeatedly elsewhere in this project (`PIPELINE.md`, the `036`/`037` Scenarios-tab redesign, the `024` view-mode-picker research) as a genuine DuckDB-native data-browsing tool, a meaningfully closer analog to this dashboard's own table needs than a generic shadcn CRM example — was fetched and read directly, file by file. It does **not** use `@tanstack/react-table` anywhere. Its real, shipped table (`src/components/relation/table/`) hand-rolls:

- **Column drag-reorder** via `@dnd-kit/sortable`'s `useSortable()` — the exact same package this app already directly depends on (`037-scenarios-tab-redesign`), for the exact same underlying mechanic (reordering a list of items via drag, with a keyboard-accessible fallback).
- **Column resize** via a hand-rolled pointer-drag handle component (`column-head-resize-handler.tsx`).
- **Column visibility** via a per-column `DropdownMenu` ("Hide Column" / a `ContentSelectColumns` searchable submenu for "Hide other Columns") — built on `components/ui/dropdown-menu.tsx` (shared with every other dropdown in that app) plus `cmdk`'s `Command` for the searchable list.
- **Sort** with `lucide-react`'s `ArrowUp`/`ArrowDown`/`ArrowUpDown`, multi-column with a small ordinal badge, and a real discoverability detail this app's own indicator lacks: the neutral `ArrowUpDown` glyph fades in on hover for every sortable-but-not-currently-sorted column, so a viewer always knows a header is clickable before clicking it.
- **Pagination footer** with a page-size `<Select>`, first/prev/next/last buttons, and a responsive `ResizeObserver`-driven collapse to a compact "N/M" format on narrow widths.

None of it needed TanStack Table. This is real, working, shipped evidence that this exact feature set is achievable hand-rolled, in a tool built for a harder version of this same problem (arbitrary DuckDB relations, not this app's own already-narrow `TableColumnConfig` grammar).

### 3e. Applying this project's own established test for a new dependency

`037-scenarios-tab-redesign` already answered a structurally identical question for `@dnd-kit` and left the reasoning on record (`CLAUDE.md`): *"`@dnd-kit` is a headless behavior toolkit, NOT a 'component library / CSS framework / icon set' — same category as Radix UI itself, `d3-sankey`, `color`, deck.gl, `@observablehq/plot` already in this tree; it ships no styled components, no tokens, no icons, and replaces no shadcn/Radix/Tailwind/`lucide-react` role. No amendment required."* Constitution Principle VI's actual text restricts "CSS framework, component library, or icon set" specifically — `@tanstack/react-table` would pass that same narrow test (it is headless, ships no styling). **The Principle VI door is open for it, exactly as it was for `@dnd-kit`.**

But passing the constitutional gate isn't the same question as whether it's the *right* tool for *this* gap. `@dnd-kit` was adopted because reordering-with-drag-and-keyboard-fallback is genuinely hard to get right by hand (this project's own `037` implementation notes record a real, non-obvious `sortableKeyboardCoordinates`-inside-a-transformed-dialog bug it had to work around even with the library). Column-visibility toggling — the one gap this task explicitly flagged as "very likely entirely new" — is not that kind of problem: it's a `Set<string>` of hidden field names, filtered against `columns` before render, paired with a small menu. There is no non-obvious algorithm to get subtly wrong.

**Confirmed, concretely, that this app already has everything needed to build it with zero new dependencies:** `components/ui/dropdown-menu.tsx` wraps `@radix-ui/react-dropdown-menu` (already a direct dependency) but currently re-exports only `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuRadioGroup`/`DropdownMenuRadioItem` — Radix's own underlying `DropdownMenuPrimitive.CheckboxItem` already exists in the installed package, it's simply not yet re-exported from this app's own wrapper. This app's own file-header comment already documents "only what's needed" as the deliberate convention for that wrapper (the same one `033-shadcn-default-theme` used when it first pared the exports down) — widening it by one export is exactly in-pattern, not a deviation.

Confirmed real column counts across all real, published `table` panels (`public/demo-dashboard-config/*.yaml`, grepped directly): typically 3–5 columns per table, none seen above roughly a dozen. `dash-ui`'s searchable `cmdk`-based picker exists because it browses arbitrary DuckDB relations that can have dozens of columns — a scale problem this app's own bounded `columns:` grammar doesn't have. A plain checkbox list needs no search box at this scale.

---

## 4. A second UI-library candidate: Observable Inputs' `Inputs.table()`

This app already depends on `@observablehq/plot` for most of its real chart content (`057-observable-plot-conversion`) — the natural question is whether its sibling package, `@observablehq/inputs`, could supply the table UI more cheaply than either hand-rolling (§3) or `@tanstack/react-table` (§3). Researched directly against `observablehq/inputs`'s real, current GitHub source — the README's own Table section, `src/table.js`, `src/style.css`, and `package.json` — not the marketing-page description alone (Observable's own docs site 429'd on this research's first request; the canonical source repo the docs site itself is generated from was fetched instead, and is more precise for API/implementation questions regardless).

### 4a. The real, documented API — quoted directly

> "A Table displays a tabular dataset; *data* should be an iterable of objects... The *data* may also be a promise to the same, in which case the contents of the table will be lazily populated once the promise resolves... **To improve performance with large datasets, the rows of the table are lazily rendered on scroll.** Rows may be sorted by clicking column headers (once for ascending, then again for descending)."

This directly answers the task's own point 1. Two things are true simultaneously, and they matter for different reasons:

- **It genuinely was designed with large datasets in mind** — the README says so explicitly, and the mechanism is real (confirmed by reading `src/table.js` itself, not just trusting the prose): a `scroll` event listener grows the number of rendered `<tr>` elements as the viewer scrolls near the bottom (`root.scrollHeight - root.scrollTop < rows * rowHeight * 1.5`), rather than rendering every row up front.
- **But this is incremental DOM growth on scroll, not true windowed virtualization.** Reading the source directly: rows already rendered are never removed as new ones are added — the DOM keeps growing the further a viewer scrolls, unlike a real virtualization library (e.g. `@tanstack/react-virtual`, already transitively present in this app's own dependency tree per §3b's finding, or `react-window`) which recycles a small, fixed pool of DOM nodes regardless of total scroll distance. For this app's own real table sizes (§3e: typically 3–5 columns, and per §5a below, real row counts under 3,000 today) this distinction is close to academic. It stops being academic at the real future scale this task is asking about (§5) — see §4d.
- **The full dataset (or one Promise resolving to it) must already be in memory before `Inputs.table()` does anything.** There is no query-level pagination, no "fetch page 2" callback, no server-side mode of any kind documented or found in the source. This is architecturally identical to what `TablePanel.tsx` already does today — `Inputs.table()` would not change the fundamental fetch-everything-then-render approach at all, only how the *rendering* half of that approach performs once the data has already arrived.
- **No `pageCount`/pagination UI at all** — the closest analog, `rows` (default `11.5`), controls the table's own visible *viewport height* before scrolling is needed, not how many rows are loaded — a fixed-height scrollable region with lazily-grown DOM content, not this app's current Previous/Next page-based UI.
- **No built-in column filtering, and search is a *separate*, paired component** (`Inputs.search()`), not part of `Inputs.table()` itself — matching this app's `searchable: true` single self-contained search box would mean composing two Observable Inputs components together, not swapping in one.
- **Selection is a first-class, built-in capability this app doesn't want**: `Inputs.table()` is dual-purpose — a display AND an input whose own *value* is the set of checkbox-selected rows. `TablePanel.tsx` has no row-selection feature, and none was requested here — this is real, unused surface area (checkboxes, a `value`/`multiple`/`required` option set, an `input` event) that would ship regardless.

### 4b. Theming — technically reachable, but fighting hardcoded values, not swapping tokens

Confirmed directly from `src/style.css`: styling is applied via a plain, class-scoped namespace (`.__ns__`) on ordinary DOM elements — **not** Shadow DOM — so CSS overrides are technically reachable via normal specificity, unlike a Shadow-DOM-encapsulated web component this app would have no way to reach at all. That is the good news.

The real finding is what the stylesheet actually contains. Its only CSS custom properties are **sizing** values (`--length1`/`--length2`/`--length3`, `--label-width`, `--input-width`) — there is no color-related custom property anywhere in the file. Table-specific rules hardcode literal values directly:

```css
.__ns__ table {
  border-collapse: separate;
  border-spacing: 0;
}
/* … */
  border-bottom: solid 1px #eee;
/* … */
  border-bottom: solid 1px #ccc;
/* … */
  background: white;
```

— and the root namespace itself sets `font: 13px/1.2 var(--sans-serif)`, a literal pixel size matching none of this app's own defined Typography roles (Body is 14px, Caption is 12px — `wftdm-design-system`'s own scale), against `var(--sans-serif)`, a variable *Observable's own* stylesheet defines and expects, not this app's `--font-body`/`--font-heading` tokens.

**Confirmed conclusion:** re-theming to Nova/shadcn tokens is possible in principle (no Shadow DOM barrier) but means authoring a full CSS override file that fights the library's own literal `#eee`/`#ccc`/`white`/`13px` values with higher-specificity rules of this app's own — not a token swap, and not a one-time cost either: any future `@observablehq/inputs` version could change those literal values again, silently reopening the override. There is also, today, **no dark-mode handling at all** in the source (no `prefers-color-scheme`, no theme-conditional rule anywhere in `style.css`) — a hardcoded `background: white` would render as a stark, wrong-themed rectangle in this app's dark mode until overridden. This is a materially harder, more ongoing theming cost than anything this app's own hand-rolled `<table>` (which was never fighting anyone else's CSS to begin with) has ever needed.

### 4c. Package boundary — confirmed fully independent, not bundled

Directly answers the task's point 3. Checked both the real npm registry metadata and the real GitHub source, not assumed from the shared `@observablehq` org name:

- `@observablehq/plot@0.6.17` (this app's installed version) — real `dependencies`: `d3`, `isoformat`, `interval-tree-1d`. **No `@observablehq/inputs`.**
- `@observablehq/inputs@0.12.0` (the current `latest`) — a fully separate npm package, its own repository (`observablehq/inputs`, distinct from `observablehq/plot`), its own real `dependencies`: `htl` (Observable's own Hypertext Literal templating library — genuinely new to this app) and `isoformat` (already an indirect dependency via `@observablehq/plot`, so not new in itself).
- The package's own `exports` map requires a **separately imported CSS file** (`@observablehq/inputs/dist/index.css`) — the JS import alone does not style anything; this is a second, explicit wiring step, not automatic.

**Adopting `Inputs.table()` would mean two new, real, direct dependencies** (`@observablehq/inputs` + `htl`), not zero, and not something already-bundled with the `@observablehq/plot` this app already ships.

### 4d. Does it solve the real problem this task is actually asking about?

No — and this is the more important finding than theming or bundle size. Section 4a already established that `Inputs.table()` requires the complete dataset resident in browser memory before it touches anything; its own "large dataset" performance story (§4a) is a DOM-rendering-cost mitigation (don't paint every `<tr>` up front), never a data-volume mitigation (don't fetch/hold every row at all). At this app's own real current scale (§5a: under 3,000 rows per real table-bound metric) that distinction doesn't matter. At the real future scale this task named — ~15,000 MAZ rows, potentially millions at person/trip level — it matters a great deal, and `Inputs.table()` does nothing for it: the same full DuckDB query, the same full Arrow-to-JS materialization, the same standing memory cost this app's current `TablePanel.tsx` already has today (§5a) would all still happen, unchanged, before `Inputs.table()` ever got a chance to lazily render a single row.

### 4e. Verdict

**Not recommended.** `Inputs.table()` solves a different problem than what this task is really asking about — it's a quick, low-code, notebook-embeddable way to browse and select rows, not a themeable, production-dashboard-grade table matching a specific, existing design system, and its own real performance story doesn't reach the layer (§5) where this app's actual future scale risk lives. Adopting it would trade a modest amount of hand-rolled interaction code for two new dependencies, an unthemed/hardcoded-color visual mismatch requiring ongoing CSS-override maintenance against a library this app doesn't control, and an unwanted row-selection capability — while leaving the real architectural question (§5) completely unaddressed. §3's conclusion (hand-roll; §6 Option B) stands, now checked against a second real candidate, not just one.

---

## 5. The real architectural question: query-time (DuckDB-side) vs. client-side (JS) pagination

This is the question the task itself flagged as "separately, and likely more important" — not about which table UI library is used, but about where sorting/filtering/pagination actually *happens*.

### 5a. What TablePanel does today, precisely, and what it actually costs at real scale

Read directly, not assumed: `panelQuery.ts#buildPanelQuery()` — the function `TablePanel.tsx` uses via `resolveQueryAndPairs()` — produces a bare `SELECT * FROM <source> [WHERE ...]`, with **no `LIMIT`, `OFFSET`, or `ORDER BY` anywhere in that code path**. The one place in the whole file that caps rows at all is a different function for a different panel type — `buildGraphicWalkerQuery()`'s own `LIMIT ${config.limit ?? 100000}`, a fixed ceiling for the Explore tab, not real pagination and not on `TablePanel.tsx`'s own path.

`services/duckdb.ts#query()` then materializes the **entire** result unconditionally: `table.toArray().map((row) => row.toJSON())` — every row of whatever the query returned becomes a plain JS object, all at once, no chunking, no streaming, no cap. `TablePanel.tsx` holds that full array in `useState`, and `tableLogic.ts`'s `sortRows()`/`filterRows()` — plain `Array.prototype.sort`/`.filter` — re-scan the **entire** array on every column-header click and, per `handleSearchChange`, on **every keystroke** in the search box (no debounce exists today).

**Real, current scale, checked directly** (not assumed): queried every real, published Parquet file in `public/demo-scenarios/activitysim-baseline/summary/` via the `duckdb` CLI. The largest is `person_household_profile.parquet` at **8,212 rows** (deliberately un-aggregated — the one metric built specifically for the Explore tab's open-ended `graphic-walker` panel, not a `table` panel). Every real `table`-bound metric in this app's own shipped demo content is **under 3,000 rows** (`tour_mode_share_summary` at 2,738 is the largest). At this scale, today's approach is not a real problem — the fetch, the JS materialization, and a full-array sort/filter are all well under any perceptible latency threshold.

**The real, stated future scale — a genuine WFRC production concern, not represented anywhere in this app's current real or demo content** — is different in kind, not just degree. At ~15,000 MAZ-level rows, and especially at "potentially millions" for a person/trip-level table, today's approach has three real, independent, compounding failure points, each traceable to a specific line of code, not hypothetical:

1. **Arrow-to-JS materialization cost** (`query()`'s `table.toArray().map(...)`) scales linearly with row count and is real CPU/memory work distinct from DuckDB's own (very fast) query-execution time.
2. **Standing memory cost** — the full array lives in React state for the panel's entire mounted lifetime, not a transient cost.
3. **Unbounded synchronous re-scans** — `sortRows()`/`filterRows()` are `O(n log n)`/`O(n)` plain-JS array operations that re-run on every interaction, with no debounce on search today. JavaScript is single-threaded: a large enough synchronous scan blocks the UI thread — not just this panel's own re-render, but every other panel and interaction on the same active tab, for however long the scan takes.

### 5b. Query-time pagination is not automatically "free" either — this app's own already-measured constraint

Before concluding "just move it server-side," this app's own real, already-measured architecture needs to be accounted for. `project-docs/PIPELINE.md`'s `050-scope-multi-connection` entry (quoted directly, not re-derived): DuckDB-WASM in this app runs as **one `AsyncDuckDB` instance with exactly one single-threaded WASM engine underneath it, behind one shared Worker** — confirmed via a real, reproducible test (16 real Parquet files, 60ms injected latency): 1, 2, 4, and 8 logical `db.connect()` connections against that one instance all land at *identical* throughput (~1.18–1.22s), fully serialized; only genuinely *separate* `AsyncDuckDB` instances (their own Worker each) actually parallelize (4 instances → 477ms, ~2.5× faster). Every `query()` call from every panel on the currently active dashboard tab already funnels through this one shared, serialized queue.

This means query-time (DuckDB-side) pagination is a genuine **trade**, not a strictly-better replacement: it exchanges one large, one-time, whole-dataset cost (today's approach) for many small, per-interaction round-trips competing on that same shared, serialized resource — a real cost of its own, just a different-shaped one. Whether that trade is worth it depends on actual per-interaction latency at real scale, which this research does not have a measured number for (a genuine future test against a real ~15k+/millions-row Parquet file would be needed before committing to a specific interaction design — see §9).

### 5c. TanStack Table's real "manual"/server-side mode — does it need the library at all?

Fetched directly from TanStack Table's own current documentation (`docs/framework/react/guide/pagination.md`), quoted precisely:

> "No pagination row model is needed for server-side pagination... Setting the `manualPagination` option to `true` will make the table instance assume that the `data` that you pass in is already paginated."
>
> "Row count alone does not decide the boundary... Use server-side pagination when the full dataset would be too expensive to query, transfer, or store in the browser."
>
> "Virtualization (or windowing) reduces rendering work by mounting only the visible rows, but the virtualized data still exists in the browser... it does not replace server-side processing when the complete dataset is too large to load."

`manualPagination`/`manualSorting`/`manualFiltering: true` are **boolean flags that turn OFF the library's own client-side row-model computation** — the table instance is told "the `data` you're handed is already the correct page/sort/filter, just render it," plus `rowCount`/`pageCount` so its own pagination UI (page numbers, next/prev enabled state) can compute correctly, plus `onPaginationChange`/`onSortingChange`/`onColumnFiltersChange` callbacks. Every one of TanStack's own worked examples wires those callbacks to **application-owned** data-fetching (`useQuery`/`useInfiniteQuery` — the caller's own query layer), never anything internal to the table library itself.

**This directly and completely answers the task's own question.** The actual "re-query the backend when the viewer sorts/pages/filters" logic is never part of TanStack Table, in manual mode or otherwise — it is, and always was, the calling application's own responsibility. TanStack Table in manual mode supplies exactly two things beyond that: (a) its own column-definition/`flexRender` presentation layer, and (b) a pre-packaged shape for pagination/sorting/filter *UI state* — and this app's own `TablePanel.tsx` already hand-rolls the identical three pieces of state (`SortState`, `searchTerm`, `currentPage`) today, just not yet wired to a re-fetch. **The "manual"/server-side pattern is architecture-agnostic: any table implementation, hand-rolled or library-based, can adopt it, because the part that matters — building a new query from the current interaction state and re-fetching — was never the table library's job in the first place.**

### 5d. What a hand-rolled query-time version would concretely require in this codebase

Grounded directly in the real code, not abstract:

- A sort/page-aware sibling to `buildPanelQuery()` (or new parameters on it) that appends `ORDER BY "<col>" <ASC|DESC> LIMIT <n> OFFSET <m>` — straightforward for the plain `SELECT * FROM <source> [WHERE ...]` shape the ordinary path already produces.
- A less-trivial-but-not-hard case for `buildComparisonDiffQuery()`'s own composed join query (`comparison: diff` columns) — would need wrapping as `SELECT * FROM (<existing composed query>) ORDER BY ... LIMIT ... OFFSET ...`, a generalizable, safe SQL technique, but real, new surface area, not automatic.
- A genuinely **new** query this app doesn't run anywhere today: a row-count query (`SELECT COUNT(*) FROM (<same predicate>)`) to compute total pages for the pagination UI — one extra query per filter-state change (cacheable, not per page-click).
- A real, **not mechanical**, search-semantics decision: today's `filterRows()` (per `spec.md`'s own documented "search what you can see" choice) matches against each column's own *rendered* (post-`formatValue()`) string — a SQL-side `ILIKE` predicate would instead match the *raw underlying* value. For a plain integer or string column these are equivalent; for a formatted percentage, a `$baseline`-diff column, or a `scenario`-label-substituted column, they are genuinely **different searches** (a viewer searching "37%" wouldn't match a raw `0.37` value via `ILIKE`). This needs a real design decision, not a drop-in translation.

This is real, buildable, bounded work — but it is also clearly its own feature, not a corollary of the column-visibility/sort-icon polish work in §6.

### 5e. Real, measured numbers — closing the gap §5b/§9 (first pass) left open

Everything above (§5a–§5d) was reasoned from this app's own real code and its own already-documented `050-scope-multi-connection` finding, but explicitly stopped short of a measured number at real scale (the first pass's own §9 named this as unresolved). This is that measurement, done directly against **the actual production DuckDB-WASM engine and connection this app ships** — not a synthetic benchmark harness, not a different database, not theory.

**Method**: two real, synthetic Parquet files were generated with native DuckDB (`COPY (SELECT ... FROM generate_series(...)) TO '...' (FORMAT PARQUET)`, the same technique this project's own `scripts/build-demo-zone-geometry.py`/`build-protomaps-test-fixture.py` already use for "prepare a small, real, git-tracked test asset," here scaled up and not committed — pure throwaway research data, deleted after this measurement) at the two real scales named this session: **15,000 rows** (`maz_scale_test`, an MAZ-shaped table — `maz_id`/`taz_id`/`district`/`households`/`population`/`employment`/`housing_type`) and **2,000,000 rows** (`trips_scale_test`, a trip-shaped table — `trip_id`/`person_id`/`origin_maz`/`dest_maz`/`primary_purpose`/`trip_mode`/`trip_distance`/etc., using this app's own real, confirmed `primary_purpose`/`trip_mode` category vocabulary). Both were served by a real `npm run dev` session and registered via `window.__wftdm.registerFileURL()` — the app's own real debug hook wrapping `services/duckdb.ts` directly, so every measured query ran through the exact same `AsyncDuckDB` instance, Worker, and `query()` materialization path a real panel uses, timed with `performance.now()` in the real browser (Playwright/Chromium), median of 3 reps per query.

**MAZ-level (15,000 rows) — not a real problem at this scale, either way:**

| Operation | Median |
|---|---|
| Full fetch (today's approach): `SELECT * FROM maz_scale_test` | 22.3ms |
| Client-side JS sort over the fetched 15,000-row array | 2.8ms |
| Client-side JS filter (substring) over the fetched array | 0.6ms |
| Query-time sort+paginate: `ORDER BY population DESC LIMIT 20 OFFSET 5000` | 6.3ms |
| Query-time filter+sort+paginate: `WHERE housing_type=... ORDER BY... LIMIT 20` | 4.8ms |
| Row-count query: `SELECT COUNT(*) WHERE housing_type=...` | 2.0ms |

Every real option is comfortably imperceptible (under ~25ms total, either architecture) at this scale. **Confirms §5a's qualitative claim with real numbers**: at 15,000 rows, this is not a live problem, and query-time pagination would not produce a noticeably different experience from today's approach.

**Trip-level (2,000,000 rows) — a real, measured, significant difference:**

| Operation | Median |
|---|---|
| Full fetch (today's approach): `SELECT * FROM trips_scale_test` | **5,149ms** |
| Client-side JS sort over the fetched 2,000,000-row array | **1,312ms** |
| Client-side JS filter (substring) over the fetched array | 102ms |
| Query-time sort+paginate, deep offset: `ORDER BY trip_distance DESC LIMIT 20 OFFSET 500000` | 516.7ms |
| Query-time filter+sort+paginate: `WHERE primary_purpose=... ORDER BY trip_id LIMIT 20` | 18.9ms |
| Row-count query: `SELECT COUNT(*) WHERE primary_purpose=...` | 26.6ms |
| Search-like query: `WHERE trip_mode ILIKE '%WALK%' ORDER BY trip_id LIMIT 20` | 16.7ms |
| 10 sequential shallow-offset "Next" clicks (`LIMIT 20 OFFSET {0,20,40,...}`) | 12.5–15.0ms **each** (sum 136.6ms for all 10) |

**This is the real, evidenced case for the future WFRC scale**: a 2-million-row table fetched today's way costs over **6.4 seconds** before a viewer sees anything (5.1s fetch + 1.3s for the first sort alone — every *subsequent* sort click repeats that same ~1.3s cost against the full in-memory array), and every keystroke in an un-debounced search box costs a real, visible ~100ms. A query-time-paginated equivalent answers a page request in tens of milliseconds for the common case (a `WHERE`-filtered or shallow-offset page) — a genuine, large, user-visible improvement, not a marginal one.

**A real, important nuance this measurement surfaced that the qualitative pass (§5b) didn't anticipate**: `LIMIT`/`OFFSET` pagination is not uniformly cheap — its cost grows with offset depth, because the database still has to compute past every skipped row. Measured directly across offset depths on the 2,000,000-row table:

| `OFFSET` depth | `ORDER BY trip_distance` (unsorted col) | `ORDER BY trip_id` (natural physical order) |
|---|---|---|
| 0 | 194.0ms | 26.9ms |
| 1,000 | 219.9ms | 17.2ms |
| 10,000 | 142.8ms | 24.4ms |
| 100,000 | 159.8ms | 87.5ms |
| 500,000 | 338.0ms | 425.1ms |
| 1,000,000 | 725.8ms | 894.7ms |
| 1,900,000 (near the end) | 812.6ms | 1,823.4ms |

At a real 2-million-row, 20-rows-per-page table (100,000 possible pages), a viewer paging deep into the list would see per-page latency climb from ~20–200ms near the start to **700ms–1.8s** near the end — a real, user-visible degradation naive `OFFSET`-based query-time pagination would introduce that today's client-side approach (pay once, then instant array-slicing per page) does not have.

**The real fix for that specific problem — also measured, not just proposed**: keyset ("cursor") pagination (`WHERE trip_id > $lastSeenId ORDER BY trip_id LIMIT 20`, advancing from the last row actually seen rather than counting past N skipped rows — the same technique TanStack Table's own docs describe for a cursor API, quoted in §5c's Appendix) stays flat and fast regardless of depth:

| Cursor position (`trip_id >`) | Latency |
|---|---|
| 0 | 75.0ms |
| 1,000 | 10.9ms |
| 10,000 | 10.5ms |
| 100,000 | 11.7ms |
| 500,000 | 44.1ms |
| 1,000,000 | 39.7ms |
| 1,900,000 | 55.5ms |

Consistently **under ~75ms at every depth tested**, vs. up to 1.8s for deep `OFFSET`. The real cost: a keyset cursor has no "jump to page N" or "jump to last page" — only next/previous from a known position (the same real constraint TanStack's own docs name for a cursor API: *"the cursor API does not expose a total... `getCanLastPage()` returns false and the Last button should stay disabled"*). **This is a genuine, concrete tension with Part A's own First/Last jump buttons** (§6 Option B, already shipped this session) — if a future query-time-pagination feature adopts real WFRC-scale trip-level tables via keyset pagination (the evidenced right choice for that scale), those two buttons would need to be disabled or removed for that specific table, a real, scoped UI difference between a small (OFFSET-paginated, First/Last available) and a huge (keyset-paginated, next/previous only) table.

**Re-confirming `050-scope-multi-connection`'s own finding, directly, on this new dataset — not just trusted from the old result**: 6 real queries against the 2,000,000-row table, timed two ways — run one at a time (sum of 6 individual times: 88.2ms) vs. fired concurrently via `Promise.all` with no sequential `await` between them (wall time: 84.1ms). Essentially identical — **confirms, again, that this app's single `AsyncDuckDB` instance genuinely serializes every query through its one shared Worker**, exactly as `050`'s own original 16-file test found. Query-time pagination gets **zero** implicit parallelism benefit from firing multiple requests at once; every panel's every interaction on the active tab still queues on the same resource.

### 5f. What this measurement changes about the recommendation

Real numbers replace speculation on the two open questions §5b/§9 (first pass) left unresolved:

1. **Does query-time pagination genuinely outperform today's approach at real WFRC scale?** Yes, clearly, for the common case — tens of milliseconds vs. multiple seconds — **and** the single-Worker serialization cost (re-confirmed directly, §5e) does **not** erode that benefit the way it eroded the `042`/`050` multi-connection-parallelism idea; that finding was about concurrent *throughput* not improving, not about individual query *latency* being slow. A single query-time page request is fast in absolute terms; it just can't be made faster by firing several at once. Nothing here resembles the `050` outcome of "the optimization we hoped for turns out to buy nothing" — the benefit at 2M rows is real and large.
2. **Is naive `OFFSET`-based pagination the right technique?** **No** — the depth-dependent degradation (§5e) is real and would be a genuine regression for a viewer paging deep into a real large table. **Keyset (cursor) pagination is the evidenced right technique** for any table_bound metric expected to reach real hundreds-of-thousands-to-millions-of-row scale, at the real, concrete cost of losing "jump to page N"/"jump to last page" for that table specifically.

This document's original §5d "what a hand-rolled version would require" is amended by this measurement, not superseded: `buildPanelQuery()` gaining `ORDER BY ... LIMIT ... OFFSET ...` (5d's own proposal) is still exactly right for small/medium tables (anything comfortably under the low hundreds-of-thousands of rows, where 5e's own MAZ-scale numbers apply) — a real future feature would need BOTH pagination strategies available, selected per-table (by author configuration, a row-count check, or both), not one universal mechanism. That per-table selection logic, the exact row-count threshold, and whether/how `TablePanel.tsx`'s pagination UI itself needs a second, cursor-shaped code path alongside its existing page-number one are all real, still-open design questions for that future feature — not decided here.

---

## 6. Options, with real tradeoffs (UI-library / polish scope — §§1–4)

### Option A — Hand-roll column-visibility only; leave everything else as-is (recommended minimum)

Add local `hiddenColumns: Set<string>` state to `TablePanel.tsx`, a small "Columns" trigger (an icon button, `lucide-react`'s `Columns3` or `SlidersHorizontal`, matching the `h-4 w-4` Default icon tier) next to the existing search box, opening a `DropdownMenu` of `DropdownMenuCheckboxItem`s — one per resolved column — filtering `columns` before render. Widen `components/ui/dropdown-menu.tsx`'s exports by one (`DropdownMenuCheckboxItem`). No new npm dependency. No grammar change required for a minimum version (state resets on refetch like `sortState`/`searchTerm` already do); an optional grammar addition (`hidden_by_default: true` per column) is a small, separate, later decision.

- **Pro:** Closes the one gap the task named as "very likely entirely new," with real precedent (dash-ui's own simpler single-menu variant, shadcn's own documented UI shape minus the TanStack wiring) for the interaction, zero new dependencies, a few hours of work.
- **Con:** Doesn't touch reordering/resizing/multi-sort/pagination polish — narrowly scoped by design.

### Option B — Hand-roll column-visibility + fix the sort-indicator gap + pagination polish (recommended) — **IMPLEMENTED**

Everything in Option A, plus:
- Replace the literal `' ▲'`/`' ▼'` Unicode glyphs with `lucide-react`'s `ArrowUp`/`ArrowDown`/`ArrowUpDown` (matching `dash-ui`'s exact three-icon convention and this app's own "`lucide-react` is the only icon library" rule) — including the neutral `ArrowUpDown`, faded and hover-revealed on a sortable-but-inactive column, so discoverability doesn't depend on a viewer accidentally clicking a header first.
- Add first/last jump buttons (`ChevronFirst`/`ChevronLast`, matching `dash-ui`'s own real icon choice exactly — confirmed against its `table-footer.tsx` directly rather than the earlier `ChevronsLeft`/`ChevronsRight` guess) and a "Showing X–Y of Z rows" caption alongside the existing "Page X of Y" — both small, additive, no new dependency.

- **Pro:** A coherent, complete answer to the task's three named topics — visual design (icon-based sort cues, matching the app's own iconography rules), formatting (paired with the §2 `formatValue.ts` fix, implemented in the same pass), and interaction (visibility + clearer pagination) — still zero new dependencies, still a small, bounded feature.
- **Con:** Larger than Option A; still doesn't add reordering/resizing/multi-sort (unchanged from this document's own original scoping — not added).

**STATUS: IMPLEMENTED, this session, exactly as scoped — zero new dependencies, as predicted.** `components/ui/dropdown-menu.tsx` gained one new export, `DropdownMenuCheckboxItem` (wrapping the already-installed `@radix-ui/react-dropdown-menu`'s own `CheckboxItem` primitive — no new package). `TablePanel.tsx` gained: a `hiddenColumns: Set<string>` state (deliberately NOT part of the existing three-way sort/search/page reset — a viewer's column-visibility preference is treated as surviving a scenario-activation or filter-driven refetch, the same way it would survive any other re-render, since the underlying column SET essentially never changes for the same author-configured panel); a `Columns3`-icon `DropdownMenu` trigger next to the search box (shown whenever there's at least one column, independent of `searchable`), with `onSelect` `preventDefault()`'d so the menu stays open across multiple toggles in one interaction (Radix's own default `CheckboxItem` behavior closes it per-click); a guard against hiding the last visible column; icon-based sort indicators (`ArrowUp`/`ArrowDown`/`ArrowUpDown`, `aria-hidden` since `aria-sort` already carries the state to assistive tech) with `group-hover`/`group-focus-visible` revealing the neutral arrow; and a rebuilt pagination footer (`ChevronFirst`/`ChevronLeft`/`ChevronRight`/`ChevronLast` icon buttons + the "Showing X–Y of Z rows" caption). Search now matches only **visible** columns (a hidden column contributing an invisible match was judged a real surprise, matching TanStack Table's own default global-filter behavior of excluding hidden columns — the closest real precedent, §3). Verified: `npx tsc --noEmit` clean; `npm run test:unit` 500/500 (up from 496 — the 4 net-new `formatValue.test.ts` cases); a new, real, stable Playwright file (`tests/integration/tablePanelOptionB.spec.ts`, 5/5 passing, twice consecutively) targets real published demo content directly (`dashboard-3-tour-models.yaml`'s "Mandatory Tour Frequency by Person Type" panel) rather than the pre-existing, already-documented-broken fixture path `tests/integration/tablePanel.spec.ts` depends on (`057-observable-plot-conversion`'s own CLAUDE.md entry records that file's full, already-triaged failure count — unrelated to and untouched by this change); both light- and dark-mode screenshots confirmed correct Nova-token theming on the new dropdown/icons live.

### Option C — Adopt `@tanstack/react-table`, rebuild TablePanel on it fully

Replace `tableLogic.ts`'s hand-rolled sort/filter with TanStack's row models; gain column-visibility, resizing, and (via `@dnd-kit`, already present) reordering essentially as configuration rather than bespoke code; multi-column sort becomes close to free.

- **Pro:** The single most complete, most "as documented by the primary reference" path — matches shadcn's own literal guidance, and genuinely does cover every gap in §2 at once, well-tested by a large, actively-maintained project.
- **Con:** A real, new architecture — a second reactive-state paradigm (`@tanstack/store`) alongside this app's own established `subscribe()`/`notify()` convention; ~32KB gzipped plus its dependency chain, for a feature set most of which (§3c) is already built, tested, and working in `tableLogic.ts`; the one real precedent this project treats as authoritative for "a serious data table done right" (`dash-ui`) explicitly does not take this path; and it would replace 120 lines of already-correct, already-unit-tested, WFRC-token-integrated logic with a dependency this app has zero prior experience operating.
- **When this is right:** if the appetite genuinely grows toward reordering + resizing + multi-sort + row-selection all at once (the full data-grid feature set, not just visibility), a fresh cost/benefit pass at that point — with the actual target feature list in hand, not a hypothetical one — could reach a different conclusion than this document does today.

### Considered and not recommended — a lighter headless alternative (e.g. `react-table`'s predecessor patterns, or a hand-rolled reusable `useTableState` hook shared across future needs)

Named for completeness. A shared internal hook generalizing sort/filter/visibility state across `TablePanel.tsx` (the only current consumer) has no second caller today to justify the abstraction — this app's own "no premature abstraction" discipline (`CLAUDE.md`'s own top-level engineering guidance) argues for keeping the logic inline/in `tableLogic.ts` until a second panel type genuinely needs the same shape.

---

## 7. Design-system audit (`wftdm-design-system`) — real findings, not assumed

Audited directly against `SKILL.md`'s Typography, Iconography, Spacing, and Color-Tokens sections.

### Already correct — no change needed

- **Header cell typography** is already, correctly, the **Section label** role verbatim (`font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground`) — `TablePanel.tsx`'s own comment already names this explicitly, including a real, self-caught correction (`font-medium` → `font-semibold`, the one deviation an internal audit found before this research even started).
- **Cell/body typography** — `font-body text-sm`, the Body role, correct.
- **Color-scale cell shading** — routes through the shared, already-correct `tokenDerivedColor()`/`NO_DATA_COLOR` (`panels/colorScale.ts`), the same real `color-mix()` mechanism `zonemapColor.ts` uses — no drift.
- **Search icon** (`h-4 w-4`) — matches the Default iconography tier exactly.
- **Loading skeleton** — genuinely shaped (header-row + body-rows), matching the Skeleton pattern's Phase 3 requirement, already complete per that section's own closing note.
- **`scrollbar-thin`** on the horizontally-scrollable table wrapper — consistent with this app's other significant scrollable regions.

### Real gaps found

- **Sort indicators are raw Unicode characters, not `lucide-react` icons.** `' ▲'`/`' ▼'` string-concatenated into the sort button's own text content. The Iconography section's own opening line — "`lucide-react` is the only icon library... this section is about SIZE/weight consistency, not which library" — implicitly assumes every icon-shaped element in the app *is* a `lucide-react` icon; a literal glyph character sidesteps that assumption rather than violating a specific rule against it, but it's still the one interactive-affordance-bearing glyph in this codebase that isn't one. Option B above fixes this with `ArrowUp`/`ArrowDown`/`ArrowUpDown` at the Default (`h-4 w-4`) tier, matching every other inline UI icon in the app.
- **No discoverability cue on an unsorted, sortable column** — a real, if small, interaction gap distinct from the icon-library question: today, a viewer must click a header once (an action, not a preview) to learn it's sortable at all. `dash-ui`'s hover-revealed neutral `ArrowUpDown` (Option B) is a direct, working answer already cited in §3d (the earlier round's UI-library section).
- **Pagination controls are the one place in this file with no icon at all** — plain-text "Previous"/"Next". Every comparable control elsewhere in this app (the `basemapTab.tsx` raster `<select>`'s "Explore options" link aside) pairs a directional action with a `lucide-react` chevron/arrow. Small, cosmetic, bundled into Option B.

### Not a design-system finding, but adjacent and worth restating here

The `formatValue.ts` bug (§2) is not a visual/token issue — it's a data-correctness one — but it directly undermines the "formatting" half of this task's own scope, and a fix belongs in whichever follow-up implements anything from this document, not deferred indefinitely alongside a purely cosmetic backlog.

---

## 8. Recommendation (synthesizing all three research passes and the implementation)

**PART A — Option B + the `formatValue.ts` fix: IMPLEMENTED, this session, exactly as scoped.** See §2's and §6's own STATUS notes for the full, verified record (zero new dependencies, 500/500 unit tests, 5/5 new integration tests passing twice consecutively, live dual-theme screenshot verification). Nothing further to decide on this part — it's done.

**PART B — the UI-library question (§§3–4, both `@tanstack/react-table` and Observable Inputs): still Option B — hand-roll.** Nothing in the second research pass changed the first pass's verdict; if anything it reinforced it. `Inputs.table()` was evaluated as a second real candidate and is **not recommended** (§4e) for the same class of reason `@tanstack/react-table` wasn't: it doesn't solve this app's actual gaps any more cheaply, it brings real, evidenced costs of its own (two new dependencies, a hardcoded/unthemeable visual style needing ongoing CSS-override maintenance, a row-selection capability this app doesn't want), and — critically, tying directly into §5 — it does **not** address the real architectural question at all: `Inputs.table()` still requires the full dataset already resident in browser memory before it does anything; its own "large dataset" story is scroll-triggered incremental DOM growth (§4a), not query-level pagination.

**PART B — the real, more important question (§5, now with real measured numbers, §5e/§5f): the fix, when one is warranted, is (b) — a query-architecture change, independent of any UI library, not (a) a library swap and not "both." This is no longer a theoretical conclusion — it's measured:**

- **Today, this is genuinely not a live problem** — confirmed both by real demo-content row counts (§5a: every published `table`-bound metric under 3,000 rows) and by direct measurement at that scale (§5e: a real 15,000-row synthetic table, comfortably larger than any real content today, costs ~22ms full-fetch, ~5ms query-time-paginated — imperceptible either way).
- **At the real, stated future WFRC scale, the difference is real, large, and now quantified, not assumed**: a real, measured 2,000,000-row synthetic trip-level table costs **~6.4 seconds** (5.1s fetch + 1.3s for the first client-side sort alone, repeated on every subsequent sort click) under today's approach, vs. **tens of milliseconds** for the equivalent query-time-paginated request in the common case (§5e). No UI library touches this — `Inputs.table()` doesn't reach this layer at all, and `@tanstack/react-table`'s own "manual" mode (§5c) explicitly delegates the exact same problem back to application code, confirmed directly from TanStack's own docs.
- **The single-Worker serialization constraint (`050-scope-multi-connection`) does NOT erode this benefit** — re-confirmed directly on the new 2,000,000-row dataset (§5e): 6 queries fired concurrently took essentially the same wall time (84.1ms) as the same 6 fired sequentially (88.2ms sum) — no implicit parallelism either way, exactly as `050` found on a different dataset. But this matters for *throughput under concurrent load*, not for the *latency of a single interaction* — and a single query-time page request at real scale is fast in absolute terms (§5e's own numbers). This is a materially different outcome from `042`/`050`'s own "the optimization we hoped for buys nothing" result; here, the benefit is real and large.
- **A real, previously-unmeasured nuance the numbers surfaced**: naive `LIMIT`/`OFFSET` pagination is NOT uniformly cheap — latency grows with offset depth (§5e: ~20–200ms near the start of a 2,000,000-row table, up to **700ms–1.8s** near the end). **Keyset (cursor) pagination is the evidenced right technique** for a table expected to reach real hundreds-of-thousands-to-millions-of-row scale — measured flat at under ~75ms regardless of depth — at the real, concrete cost of losing "jump to page N"/"jump to last page" for that specific table (a genuine tension with Part A's own newly-shipped First/Last buttons, §5e).

**Therefore, unchanged in direction but now grounded in real numbers**: treat query-time pagination for `TablePanel.tsx` as its own, separate, larger feature, with a real, evidenced design constraint the earlier qualitative pass didn't have — it needs BOTH an offset-paginated mode (small/medium tables, §5d's own proposal) AND a keyset-paginated mode (real large tables, §5f) — not one universal mechanism, and a real per-table selection question (author-configured, row-count-triggered, or both) this document still does not resolve. Not folded into, and not blocked on, the Part A polish work already shipped.

**Independent of everything else:** the `formatValue.ts` bugs (§2) are now fixed, verified, and shipped as part of Part A — no longer an open item.

---

## 9. What this document does not decide

**Resolved, no longer open**: whether Option A/B/C is adopted (Option B — implemented, §6); whether/how the `formatValue.ts` bugs are fixed (done, §2); whether real, measured latency numbers exist at real WFRC scale for the query-architecture question (done, §5e — a real synthetic dataset, generated and measured live against the production DuckDB-WASM engine, then fully deleted; nothing was committed to the repo).

**Still genuinely open** — a real future query-time-pagination feature, not decided or built here:

- Whether query-time pagination is built at all, and if so when — this document establishes it *would* help materially at real future scale (§5e/§5f) and roughly what it would take (§5d), not that it should be built now.
- The real per-table selection mechanism between an offset-paginated mode (small/medium tables) and a keyset-paginated mode (real large tables) — author-configured (a new grammar field), an automatic row-count threshold, or both — and what that threshold would be. §5f names this as the one open design question the measurement itself couldn't resolve.
- How `TablePanel.tsx`'s own pagination UI would need to branch for a keyset-paginated table (no "jump to page N"/"jump to last page," per §5e/§5f) vs. the offset-paginated First/Last buttons Part A just shipped for the common, small-table case.
- Whether search moves from today's render-then-filter-in-JS semantics to a SQL-side `ILIKE`/keyset predicate over raw values (§5d notes these are not equivalent for formatted/diff columns — a real design question, not a mechanical translation).
- How `buildComparisonDiffQuery()`'s composed join query would be wrapped for `ORDER BY`/`LIMIT`/`OFFSET`/keyset predicates and a total-row-count query.
- Any change to `panelQuery.ts`'s existing exports, the `columns:`/`sort:`/`pagination:`/`searchable:` grammar's existing shape, or any other panel type — this document only establishes that a change *could* be made, roughly what it would need to touch, and — now — that it would deliver a real, large, measured benefit at real future scale. Not that it should be built yet, or by whom, or when.

Every item above is a real, separately-scoped `/speckit-specify`-sized decision, consistent with how this project's features have always been bounded.

---

## Appendix — Sources

- [shadcn/ui — Data Table](https://ui.shadcn.com/docs/components/data-table) · [Table](https://ui.shadcn.com/docs/components/table)
- [TanStack Table — npm registry](https://registry.npmjs.org/@tanstack/react-table) (live, `9.2.4`) · [Bundlephobia](https://bundlephobia.com/package/@tanstack/react-table@9.2.4) · [Pagination guide, incl. manual/server-side mode](https://github.com/TanStack/table/blob/main/docs/framework/react/guide/pagination.md) (fetched directly)
- `gropaul/dash-ui` (fetched directly via `gh api`): `src/components/relation/table/table-column/{content-select-columns,column-dropdown-content}.tsx`, `src/components/relation/table/table-head/table-column-head.tsx`, `src/components/relation/table/table-footer.tsx`, `src/components/basics/column-head-sorting-icon.tsx`
- `observablehq/inputs` (fetched directly via `gh api`): `README.md` (Table section), `src/table.js`, `src/style.css`, `package.json` · [npm registry](https://registry.npmjs.org/@observablehq/inputs) (live, `0.12.0`)
- [`@observablehq/plot` — npm registry](https://registry.npmjs.org/@observablehq/plot) (live, `0.6.17` — confirmed its own real `dependencies` field does not include `@observablehq/inputs`)
- Internal: `src/panels/{TablePanel.tsx,tableLogic.ts,formatValue.ts}`, `src/panels/panelQuery.ts` (`buildPanelQuery()`/`buildGraphicWalkerQuery()`/`buildComparisonDiffQuery()`), `src/services/duckdb.ts` (`query()`/`registerFileURL()`), `src/layout/types.ts` (`TableColumnConfig`/`TablePanelConfig`), `src/components/ui/dropdown-menu.tsx`, `project-docs/GRAMMAR.md`'s `type: table` section, `project-docs/PIPELINE.md`'s `050-scope-multi-connection` entry, `public/demo-dashboard-config/*.yaml` (grepped for real `format:`/`columns:` usage), `public/demo-scenarios/activitysim-baseline/summary/*.parquet` (real row counts, queried directly via the `duckdb` CLI), `.specify/memory/constitution.md` Principle VI, `CLAUDE.md`'s `037-scenarios-tab-redesign`/`057-observable-plot-conversion` entries, `.claude/skills/wftdm-design-system/SKILL.md`, `project-docs/BASEMAP-PICKER-PROPOSAL.md` (format precedent)
- §5e's own real, measured data: two synthetic Parquet files (15,000 MAZ-shaped rows; 2,000,000 trip-shaped rows, real `primary_purpose`/`trip_mode` vocabulary) generated with native DuckDB (`COPY (SELECT ... FROM generate_series(...)) TO ... (FORMAT PARQUET)`, the same technique as `scripts/build-demo-zone-geometry.py`/`build-protomaps-test-fixture.py`), served by a real `npm run dev` session, registered via `window.__wftdm.registerFileURL()` against the actual production `AsyncDuckDB` instance, and measured with `performance.now()` in a real Chromium browser (Playwright) — not committed; deleted after measurement, confirmed via `git status`.
- The implementation itself: `src/components/ui/dropdown-menu.tsx`, `src/panels/TablePanel.tsx`, `src/panels/formatValue.ts`, `tests/unit/formatValue.test.ts`, `tests/integration/tablePanelOptionB.spec.ts` (all new/modified this session)
