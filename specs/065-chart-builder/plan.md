# Implementation Plan: Chart Builder (Explore v2)

**Branch**: `065-chart-builder` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/065-chart-builder/spec.md`. Background: `project-docs/CHART-BUILDER-PROPOSAL.md`.

## Summary

Replace the Graphic Walker Explore tab with a built-in chart builder: a **Data tab** (raw-table browser, SQL editor plus
query-builder form, saved temporary relations) and **visualization tabs** (drag columns onto encoding channels, ranked
chart suggestions, text styling, export/import). Charts are a declarative, Vega-Lite-shaped **chart spec** compiled to
SQL (aggregation in DuckDB) and drawn by Observable Plot with the app's existing `ChartTheme`, tooltip, legend and export
machinery, so they are visually indistinguishable from curated charts.

Technical approach (details in [research.md](./research.md)):

1. A pure, DOM-free core in `src/charts/builder/` (spec types + validation, spec→SQL, spec→Plot compile, suggestion rules,
   hatch/dash helpers). A single function `renderChart(el, { spec, rows, theme, width, height })` is shared by two hosts:
   the Explore preview and a new `custom` chart kind (so the same spec also works in `dashboard-*.yaml`).
2. A new lazy panel type `explore-builder` (`src/explore/`) owning the shell, Data tab, viz tabs, shelves and in-memory
   session state (`src/state/exploreState.ts`).
3. User SQL runs read-only through the existing `authorize()` guard on the one shared connection; saved results are
   app-generated `CREATE OR REPLACE TEMP VIEW "xb_<name>"` statements (the user never submits DDL). Query/builder sync uses
   DuckDB's `json_serialize_sql` for the supported subset, with a documented one-way fallback.
4. No new dependencies in v1 (textarea SQL editor, `@dnd-kit` already installed, Plot already installed).

## Technical Context

**Language/Version**: TypeScript (ES2022), React (existing)

**Primary Dependencies**: `@observablehq/plot` ^0.6.17, `d3-shape` (pie/donut), `@duckdb/duckdb-wasm` ^1.29 (installed 1.32), `@dnd-kit/*` (installed), `js-yaml`, shadcn/ui primitives + Tailwind v4 + `lucide-react`. **No new dependency.**

**Storage**: In-memory module state only (no Web Storage). Temporary relations live in the DuckDB session. Persistence = exported JSON configuration.

**Testing**: Vitest (pure core: spec validation, spec→SQL, compile, rules, guard additions, AST→model fixtures); Playwright (shell, drag/keyboard assign, export/import, light/dark) following the repo's existing Playwright projects and shared-fixture-lock rule.

**Target Platform**: Modern desktop browsers, static hosting (GitHub Pages demo and WFRC server)

**Project Type**: Single-page web app (existing Vite + React app)

**Performance Goals**: first chart of two columns in ≤60 s of user time; 100k-row relation re-renders in ≤2 s after a change (SC-004); page stays responsive during queries (Worker)

**Constraints**: one shared DuckDB connection (statements are serialized; a long query blocks panels, so mutex + cancel + timeout); palette tokens only; no Plot `tip`/native titles; light and dark; keyboard operable; builder code lazily loaded and absent from the entry graph

**Scale/Scope**: ~8 v1 chart types, 13 channels, ~35 new source files, 1 new panel type, 1 new chart kind

## Constitution Check

*GATE: pass before Phase 0; re-checked after Phase 1.*

| Principle | Status | Note |
|---|---|---|
| I TypeScript, React | Pass | all `.ts`/`.tsx` |
| II One shared DuckDB, off main thread | Pass | everything goes through `services/duckdb.ts` `query/queryArrow/cancelRunning`; no second connection |
| III No eval(); string replacement SQL | Pass | spec→SQL by templating; identifiers come from `DESCRIBE`d columns and are quoted/escaped; literals escaped. User-typed SQL is data run by the engine, never evaluated by the app |
| IV YAML at runtime | Pass | `kind: custom` + `spec:` parsed at runtime with the rest of the dashboard YAML |
| V Parquet-only browser I/O | Pass | no new data formats are read; CSV/PNG/SVG are download outputs; JSON is a configuration file, not data |
| VI Fixed technology | Pass | Plot/D3 already allowed; no Web Storage; no new CSS or icon set; **no CodeMirror in v1** (would be a new dependency, flagged for a later amendment-free decision) |
| VII Three config file types | Pass with note | chart spec lives inside `dashboard-*.yaml`; the exported chart JSON is a user artifact, not a fourth deployer config type |
| VIII Reuse reference implementations | Pass | `ar-puuk/spatial-sql-explorer` / `parquet-viewer` (SQL workbench patterns), `gropaul/dash` (chart-config patterns) consulted in research |
| IX Python/JS split | Pass | JS only under `src/` |
| Technology Stack Reference (binding) | **Action required** | row "Explore tab | Graphic Walker" must be amended (MINOR bump, 2.6.0 → 2.7.0) **in the same change that removes Graphic Walker** (User Story 7). Until then the builder coexists, so no violation |

No unjustified violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/065-chart-builder/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chart-spec.md
│   ├── query-and-guard.md
│   └── builder-ui.md
├── checklists/requirements.md
└── tasks.md            # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── charts/
│   ├── builder/                    # pure core, no DOM stores, no DuckDB
│   │   ├── spec.ts                 # ChartSpec types, defaults, channel/mark tables
│   │   ├── schema.ts               # JSON Schema + validateSpec() (import, YAML)
│   │   ├── specToSql.ts            # spec + relation -> aggregate/bin/filter SQL
│   │   ├── compile.ts              # rows + spec -> Plot marks (renderChart)
│   │   ├── pieDonut.ts             # d3-shape pie/donut (Plot has none)
│   │   ├── patterns.ts             # hatch <pattern> defs, identity fill values
│   │   ├── dash.ts                 # per-series dash arrays, one-mark-per-series split
│   │   ├── legend.ts               # LegendSpec incl. dash/pattern/symbol swatches
│   │   ├── textBlocks.ts           # title/subtitle/source/note, size+weight+italic
│   │   ├── rules.ts                # suggestion rule table (data) + score/rank + slot table
│   │   ├── columnTypes.ts          # DuckDB type -> N/O/Q/T/geo/complex
│   │   └── axisFormat.ts           # number/date format + scale options
│   └── kinds/custom.ts             # `type: chart, kind: custom, spec: ...` for YAML tiles
├── explore/                        # lazy panel `explore-builder`
│   ├── ExploreBuilderPanel.tsx     # shell: scenario + table pickers + tabs
│   ├── dataTab/                    # DataTab, PreviewTable, SchemaStrip, SqlPanel, QueryBuilderForm, MyTables
│   ├── vizTab/                     # VizTab, FieldList, Shelves, FieldChip(+popover), ChartPicker, StylePanel, AxesPanel, FiltersPanel
│   ├── BuilderChartHost.tsx        # preview host: resolves theme, calls renderChart, tooltip/legend/export wiring
│   ├── sql/                        # runUserSql.ts (guard+mutex+timeout), describe.ts, astToModel.ts, modelToSql.ts
│   ├── importExport.ts             # JSON config export/import, CSV/PNG/SVG via exportTile.ts
│   └── useAssignByKeyboard.ts      # accessible alternative to drag and drop
├── state/exploreState.ts           # tabs, specs, temp-relation catalog (in memory)
├── panels/registry.tsx             # + 'explore-builder' lazy entry
└── services/ai/sqlGuard.ts / sqlRunner.ts   # small touch: protect/exempt the `xb_` prefix (see contracts/query-and-guard.md)

tests/
├── unit/                           # builder core + sql model + guard
└── integration/                    # Playwright: explore-builder*.spec.ts
```

**Structure Decision**: extend the existing single Vite/React app. The pure core lives in `src/charts/builder/` (next to
the chart system it feeds); UI lives in a new `src/explore/` folder behind one lazy panel type, replacing
`GraphicWalkerPanel` only at the end (User Story 7).

## Phase outputs

- Phase 0: [research.md](./research.md): decisions, alternatives, and the **spike list** that gates later phases.
- Phase 1: [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md).

## Delivery phases (input to /speckit-tasks)

| Phase | Delivers | Gated by |
|---|---|---|
| 0 Spikes | S1–S6 in research.md | none |
| 1 Core | spec types/schema, spec→SQL, compile for bar/line/scatter, `custom` kind, YAML demo tile | S3, S4 |
| 2 Data tab | pickers, preview, schema strip, SQL panel (read-only), My tables, mutex/cancel/timeout | S2, S5 |
| 3 Viz tabs | tabs, field list, drag+keyboard shelves, suggestions, remaining v1 charts, facets, dash/symbol/pattern, text styling | Phase 1 |
| 4 Sync + options | query-builder form with two-way sync, filters, axes/scales, reference lines | S1 |
| 5 Export/import | JSON config, PNG/SVG/CSV, YAML parity | Phase 3 |
| 6 Replace | switch Explore tab, remove Graphic Walker + chunk + CSS, amend constitution/CLAUDE.md | acceptance |

Post-design Constitution re-check: unchanged, all pass; the amendment action is scheduled in Phase 6.

## Complexity Tracking

None.
