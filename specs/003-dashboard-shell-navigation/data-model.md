# Data Model: Dashboard Shell, Navigation, and First Two Panel Types

**Feature**: `003-dashboard-shell-navigation` | **Date**: 2026-08-30

No application database — "entities" here are the TypeScript shapes this
feature defines to give `dashboard-*.yaml`'s previously-opaque `raw: unknown`
real structure, plus the registry/query concepts the panel pattern
introduces. Values and field names are drawn directly from
`project-docs/GRAMMAR.md`'s already-documented grammar — this file does not invent
new YAML syntax, only the TypeScript types that parse it.

---

## DashboardTabConfig

Parsed from one `dashboard-*.yaml` file's `raw` content
(`services/yamlLoader.ts`'s `DashboardConfig.raw`), via
`layout/types.ts`'s `parseDashboardConfig()`.

| Field | Type | Notes |
|---|---|---|
| `header` | `{ tab: string; title: string; description?: string }` | `tab` is the nav-bar label (`project-docs/GRAMMAR.md` `header.tab`) |
| `filters` | `FilterDefinition[]` | Global sidebar filters for this tab; may be empty |
| `layout` | `Record<string, PanelConfig[]>` | Keyed by row name (e.g. `row_kpis`); each row is an ordered list of panels |

**Validation**: `parseDashboardConfig` throws a descriptive error (caught by
the loader, surfaced as a load-time failure for that one tab, per FR-010's
"visible and specific" posture) if `header.tab` or `header.title` is
missing — every other field has a safe default (`filters: []`,
`layout: {}`).

---

## FilterDefinition

One entry in a tab's `filters` array (`project-docs/GRAMMAR.md`'s `filters:` key).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Matches `state/filterState.ts`'s `FilterId` — what `$filters.<id>` references |
| `label` | `string` | UI label |
| `type` | `'select' \| 'multiselect' \| 'range'` | Only `select` is exercised by this feature's fixture; `multiselect`/`range` are parsed but not given dedicated UI controls here (out of scope — no filter-editing UI is part of this feature's stories) |
| `source` | `string` | Metric name to pull distinct values from |
| `column` | `string` | Column within that metric |
| `default` | `string` | Initial value; `'all'` is the sentinel `sqlExpander.ts` already special-cases |
| `all_option` | `boolean?` | Whether an "All" choice is offered |

**Relationship**: `FilterDefinition.id` is the same `FilterId` space
`state/filterState.ts` and `hooks/useFilterState.ts` operate on — this
feature does not introduce a second filter-identity concept.

---

## PanelConfig (discriminated union on `type`)

Common fields (`project-docs/GRAMMAR.md`'s "All panels share these common keys"),
plus one variant per panel type this feature implements.

### Common fields

| Field | Type | Notes |
|---|---|---|
| `type` | `'valuebox' \| 'plotly'` | Discriminant; registry lookup key |
| `title` | `string` | Panel card header |
| `metric` | `string` | Parquet file name (no extension) to query |
| `filter` | `string?` | Inline `$filters.x` reference used in the panel's query |
| `height` | `number` | Default `350` |
| `width` | `number` | Fraction of row width, `0.0`–`1.0` |
| `scenario` | `string?` | Restrict to exactly one named scenario view, bypassing the `$scenario.x` union entirely (`contracts/panel-query.md`) |
| `scenarios` | `string[]?` | Explicit override of which globally-active scenarios this panel unions over via `$scenario.x` (`contracts/panel-query.md`'s `resolveActiveScenarios`); if `scenario` is also set, `scenario` wins — there's no union left for `scenarios` to affect |

### ValueBoxPanelConfig (`type: 'valuebox'`)

| Field | Type | Notes |
|---|---|---|
| `column` | `string` | Column from `metric` to display |
| `format` | `string` | Python-style format string (e.g. `"{:,.0f}"`) |
| `unit` | `string?` | Subtitle unit label |
| `icon` | `string?` | Kebab-case `lucide-react` icon name (research.md §7) |
| `observed` | `number?` | Reference value shown below the main value |
| `threshold_warn` | `number?` | Absolute diff from `observed` → warn styling |
| `threshold_fail` | `number?` | Absolute diff from `observed` → fail styling |

### PlotlyPanelConfig (`type: 'plotly'`)

| Field | Type | Notes |
|---|---|---|
| `traces` | `PlotlyTraceConfig[]` | See below |
| `layout` | `Record<string, unknown>?` | Passed through to Plotly's own `layout` object (e.g. `xaxis`/`yaxis`/`showlegend`) — not re-typed field-by-field; Plotly's own types govern its shape |
| `observed` | `{ source: string; style?: string } & Record<string, unknown>?` | Optional observed-data overlay (out of this feature's required scope; parsed if present, not required to render for FR-005/FR-006 to be satisfied) |
| `reference_lines` | `unknown[]?` | Parsed and passed through if present; not required by this feature's stories |

**PlotlyTraceConfig**: `{ type: string; x?: string; y?: string; color?: string; mode?: string; name?: string; text?: string; barmode?: string }` — each of `x`/`y`/`color`/`name`/`text` may hold a literal value, a `$metric.<column>` reference, or the bare `$scenario` sentinel (research.md §3); `PlotlyPanel.tsx` resolves these against the query result before constructing the actual Plotly trace object.

**Invariant**: a `PlotlyPanelConfig` MUST have at least one trace with both
`x` and `y` set for FR-006's "renders it as a chart" to be satisfiable —
enforced as a runtime check surfaced through `panelCard.tsx`'s error
boundary (FR-010), not a build-time type constraint (config is YAML, not
compiled).

---

## Panel Registry Entry

The mapping this feature populates for the first time
(`panels/registry.tsx`).

| `type` string | Component |
|---|---|
| `valuebox` | `ValueBoxPanel` |
| `plotly` | `PlotlyPanel` |

**Contract**: every entry is a React `ComponentType<PanelProps<TConfig>>`
(constitution v2.2.0) — `panelCard.tsx` looks up `registry[config.type]`,
renders it with `<PanelComponent config={config} />`, and renders a
"no matching panel type" error state itself if the lookup misses (a config
authoring error, handled the same way as any other panel-scoped failure,
FR-010).

---

## Relationships

```
services/yamlLoader.ts's DashboardConfig.raw (unknown)
                    |
                    v  layout/types.ts's parseDashboardConfig()
              DashboardTabConfig { header, filters[], layout }
                    |
      +-------------+-------------------+
      v                                 v
FilterDefinition[]                PanelConfig[] (per layout row)
      |                                 |
      v (rendered as filter controls    v  panels/registry.tsx lookup by .type
      by a future feature — out of      |
      scope here; filters are parsed    v
      and usable via $filters.x even  ValueBoxPanel.tsx | PlotlyPanel.tsx
      without a dedicated control UI)    |
                                         v  panels/panelQuery.ts
                                   SQL template ($scenario.x / $filters.x)
                                         |
                                         v  services/sqlExpander.ts's expand()
                                   literal SQL
                                         |
                                         v  services/duckdb.ts's query()
                                   rows -> rendered value / Plotly chart
```

`hooks/useFilterState.ts` sits alongside this flow, not inside it: any
panel component calls `useFilterState(config.filter ? [extractFilterId(
config.filter)] : ['*'])` (or a similar per-panel derivation — exact
extraction logic is an implementation detail, not a data-model concern) to
get the current filter values that feed `panelQuery.ts`.
