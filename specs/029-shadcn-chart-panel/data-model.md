# Phase 1 Data Model: shadcn/Recharts Chart Panel Type

## 1. `RechartsPanelConfig` (new, `src/layout/types.ts`)

```ts
export interface RechartsPanelConfig
  extends DataBoundPanelConfigBase,
    ComparisonCapablePanelConfig {
  type: 'recharts'
  chart_type: 'bar' | 'line' | 'area'
  x: string           // required — the category/axis column, a real,
                        // literal result-set column name
  y: string            // required — the value column
  series?: string      // optional — a column whose distinct values split
                        // the data into multiple named, separately-
                        // colored series (research.md §2/§3)
  stacked?: boolean    // optional, default false — for chart_type: bar
                        // or area with a `series` set, whether multiple
                        // series stack on top of each other or render
                        // side-by-side/overlaid
}
```

Added to the `PanelConfig` discriminated union alongside the existing nine
variants. `metric`/`filter`/`scenario`/`scenarios`/`comparison`/
`compare_on` are all inherited unchanged from the two mixins — no new
field for any of them.

**Validation rules**:
- `chart_type` MUST be one of `'bar' | 'line' | 'area'` — any other value
  (e.g. `'pie'`) is an authoring error (spec.md Edge Cases), surfaced the
  same way an unrecognized panel `type:` already is elsewhere in this
  app's config parsing, not silently ignored.
- `x`/`y` are both required — a chart with no axis mapping has nothing to
  render.
- `series` is optional; its absence means single-series (one bar/line/
  area, one color: `--chart-1`).

## 2. Selectable/derived shapes (not persisted — recomputed per query)

### Tidy query row (what `buildPanelQuery()` returns, unchanged)

```ts
type TidyRow = Record<string, unknown> // e.g. { purpose: 'HBW', mode: 'SOV', share: 0.62 }
```

### Wide chart row (what Recharts' own `<BarChart data={...}>` needs)

```ts
type WideChartRow = { [xValue: string]: string | number }
// e.g. { purpose: 'HBW', SOV: 0.62, HOV: 0.18, Transit: 0.09 }
```

### `ChartConfig` (shadcn's own real type, from `components/ui/chart.tsx`)

```ts
type ChartConfig = Record<string, { label: string; color: string }>
// e.g. { SOV: { label: 'SOV', color: 'var(--chart-1)' },
//        HOV: { label: 'HOV', color: 'var(--chart-2)' }, ... }
```

## 3. `rechartsEncoding.ts` contract

```ts
/**
 * Pivots tidy SQL rows into Recharts' own wide-row shape plus a matching
 * ChartConfig, cycling through --chart-1..--chart-5 in order (wrapping
 * after the fifth distinct series value). Pure — no DOM, no React.
 *
 * @param rows the tidy query result rows
 * @param config the panel's own x/y/series field-mapping
 * @returns wide-format rows ready for Recharts' `data` prop, plus the
 *   ChartConfig ready for `ChartContainer`'s own `config` prop
 */
export function encodeRechartsData(
  rows: TidyRow[],
  config: Pick<RechartsPanelConfig, 'x' | 'y' | 'series'>,
): { data: WideChartRow[]; chartConfig: ChartConfig; seriesKeys: string[] }
```

**Behavior**:
- No `series` configured: `seriesKeys` is a single synthetic key (the
  panel's own `y` field name); every row becomes `{ [x]: row[x], [y]:
  row[y] }`; `chartConfig` has one entry, colored `--chart-1`.
- `series` configured: one output row per distinct `x` value, with one
  column per distinct `series` value holding that combination's `y`
  value (missing combinations left `undefined`, not `0` — a genuine
  no-data gap, not a real zero); `chartConfig` has one entry per distinct
  series value, colors cycling `--chart-1` → `--chart-5` → `--chart-1`...
  in first-seen order (deterministic, not re-sorted).

## 4. Component state (`RechartsPanel.tsx`)

Matches the established Panel pattern exactly — no new state shape beyond
what `PlotlyPanel.tsx`/`ObservablePlotPanel.tsx` already use:

- `status: 'loading' | 'ready' | 'empty' | 'error'`
- `rows: TidyRow[]` (raw query result, before encoding)
- Derived (not separately stored — recomputed from `rows`+`config` each
  render, matching `plotlyTraces.ts`'s own "derive, don't duplicate"
  convention): `{ data, chartConfig, seriesKeys }` via
  `encodeRechartsData()`.

**State transitions**: identical shape to every other data-bound panel
type — `useFilterState`-driven refetch on filter/scenario/config change,
`useEffect` cleanup on unmount, no new lifecycle behavior.
