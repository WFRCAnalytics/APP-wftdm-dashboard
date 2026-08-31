# Data Model: TablePanel

**Feature**: `005-table-panel` | **Date**: 2026-08-31

No new persisted data, no new config file, no new config file type
(constitution Principle VII unaffected). This feature's shapes are: the
typed parsing of `type: table`'s already-documented `dashboard-*.yaml`
grammar (`layout/types.ts`), and the internal, pure-logic types
`tableLogic.ts` uses to go from that config + a query result to what
actually renders.

---

## TableColumnConfig

One entry in a `table` panel's `columns:` list (`docs/GRAMMAR.md`).

| Field | Type | Notes |
|---|---|---|
| `field` | `string` | Source column name — must match a key on the query result's rows for that column to render populated (a mismatch renders a blank cell, spec.md's Edge Cases, not a crash) |
| `label` | `string?` | Display header text; falls back to `field` verbatim when omitted |
| `format` | `string?` | Python-style format string (`",.0f"`, `"+.1%"`), the same convention `ValueBoxPanelConfig.format` already uses — applied via the shared `formatValue()` (research.md §2) |
| `color_scale` | `'sequential' \| 'diverging'?` | When present, that column's cells get a `cellColor()`-computed background (research.md §4) |
| `domain` | `[number, number]?` | The value range `color_scale` maps against; required for `color_scale` to have any effect (no domain, no color) |

---

## TablePanelConfig (`type: 'table'`, extends `PanelConfigBase`)

| Field | Type | Notes |
|---|---|---|
| `columns` | `TableColumnConfig[]?` | When present, governs which fields display, in what order, with what label/format/color (FR-003). When absent, columns are derived from the query result's own shape instead (FR-004) |
| `sort` | `{ column: string; order: 'asc' \| 'desc' }?` | Initial sort applied before any user interaction (FR-008); omitted means the query result's own returned row order |
| `pagination` | `number?` | Page size override; omitted falls back to the documented default, 20 (spec.md's Assumptions, sourced from `docs/GRAMMAR.md`'s own example value) |
| `searchable` | `boolean?` | When `true`, a search input is rendered (FR-011); omitted/`false` means no search UI |

`PanelConfigBase`'s existing common fields (`title`, `metric`, `filter`,
`height`, `width`, `scenario`, `scenarios`) all apply unchanged — nothing
about this panel type needs a new common field.

**Union update**: `layout/types.ts`'s `PanelConfig` becomes
`ValueBoxPanelConfig | PlotlyPanelConfig | TablePanelConfig |
UnknownPanelConfig` — a `type: table` entry now parses to a real,
narrowed type instead of falling through to `UnknownPanelConfig`'s wide
shape.

---

## ResolvedColumn (internal — `tableLogic.ts`, not part of the YAML grammar)

What `resolveColumns()` (research.md §3) actually hands back to
`TablePanel.tsx` to render, regardless of whether `columns:` was
authored or derived.

| Field | Type | Notes |
|---|---|---|
| `field` | `string` | Same as `TableColumnConfig.field`, or the derived row key |
| `label` | `string` | Always resolved to a real string by this point — `TableColumnConfig.label` if given, else `field` verbatim; never `undefined` downstream |
| `format` | `string?` | Passed through from config; absent when columns were derived (no config to carry it) |
| `colorScale` | `'sequential' \| 'diverging'?` | Passed through from config; absent when derived |
| `domain` | `[number, number]?` | Passed through from config; absent when derived |

---

## Relationships

```
dashboard-*.yaml's type: table entry
        |
        v  layout/types.ts's parseDashboardConfig()
  TablePanelConfig { columns?, sort?, pagination?, searchable?, ...common }
        |
        v  panels/registry.tsx lookup by .type === 'table'
  TablePanel.tsx
        |
        +-- useFilterState (unchanged, existing hook)
        +-- panelQuery.ts's buildPanelQuery + sqlExpander.expand()
        |     (unchanged — SELECT * branch already covers this config
        |      shape, since it has no singular `column` field)
        +-- services/duckdb.ts's query()  ->  rows: Record<string, unknown>[]
        |
        v  panels/tableLogic.ts (pure, no DOM)
  resolveColumns(config, rows)   -> ResolvedColumn[]
  filterRows(rows, columns, searchTerm)  -> filtered rows
  sortRows(filtered, sortState)          -> sorted rows
  cellColor(value, colorScale, domain)   -> CSS color string | undefined
        |
        v  TablePanel.tsx's own render
  <table> — page-sliced sorted+filtered rows, ResolvedColumn-driven
  headers/cells, formatValue() per cell, cellColor() background where
  color_scale is configured
```

`panels/formatValue.ts` sits alongside this flow, shared with
`ValueBoxPanel.tsx` — both panel types call the exact same function for
the exact same format-string convention, not two independently-maintained
copies (research.md §2).

`004`'s expand-to-dialog mechanism (`usePanelExpandHost`) has no
relationship to any of the shapes above — `TablePanel.tsx` is just
another `PanelComponent` the mechanism portals, identical in that respect
to `ValueBoxPanel`/`PlotlyPanel` (FR-015).
