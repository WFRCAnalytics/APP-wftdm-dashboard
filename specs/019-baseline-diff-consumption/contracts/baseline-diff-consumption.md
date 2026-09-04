# Contract: $baseline consumption across panel types

## `layout/types.ts`

```ts
// NEW — mirrors MapRenderingPanelConfig's existing mixin pattern exactly.
export interface ComparisonCapablePanelConfig {
  comparison?: 'side_by_side' | ComparisonDiff
  compare_on?: string[]
}

// ComparisonDiff itself: UNCHANGED (a/b remain plain string; '$baseline' is
// a value they may hold, not a type-level change).

export interface ZoneMapPanelConfig
  extends DataBoundPanelConfigBase, MapRenderingPanelConfig, ComparisonCapablePanelConfig {
  type: 'zonemap'
  // ... unchanged fields; local `comparison` field REMOVED (now inherited)
}

export interface PlotlyPanelConfig extends DataBoundPanelConfigBase, ComparisonCapablePanelConfig {
  type: 'plotly'
  // ... unchanged existing fields
}

export interface TablePanelConfig extends DataBoundPanelConfigBase, ComparisonCapablePanelConfig {
  type: 'table'
  // ... unchanged existing fields
}

export interface ObservablePlotPanelConfig extends DataBoundPanelConfigBase, ComparisonCapablePanelConfig {
  type: 'observable-plot'
  // ... unchanged existing fields
}
```

## `panels/panelQuery.ts` additions

```ts
const BASELINE_SENTINEL = '$baseline'

/** Resolves a ComparisonDiff.a/.b value: '$baseline' -> the current
 * baseline scenario name (or undefined if unresolved); anything else ->
 * passed through unchanged. Pure — no appState import (research.md §4). */
export function resolveComparisonScenarioName(
  name: string,
  baseline: string | undefined,
): string | undefined

/** Moved here from its previous ZoneMapPanel.tsx-local definition —
 * shared by all four panel types now (research.md §5). */
export function isComparisonDiff(
  comparison: 'side_by_side' | ComparisonDiff | undefined,
): comparison is ComparisonDiff

/** Generalized from ZoneMapPanel-only (013) to accept plain parameters
 * instead of a config object — every input it needs is already explicit
 * (research.md §2). Byte-for-byte identical output to the pre-existing
 * zonemap-only version when compareOn is a single-element array matching
 * that call site's own metric_id. */
export function buildComparisonDiffQuery(
  metric: string,
  aScenario: string,
  bScenario: string,
  compareOn: string[],
  expr: string,
): string
```

**Removed**: the old `buildComparisonDiffQuery(config: ZoneMapPanelConfig, diff: ComparisonDiff)` signature — replaced in place (not kept as a second overload) since `ZoneMapPanel.tsx` is the only caller today and is migrated in the same change.

## Per-panel-type fetch effect contract (identical shape across all four)

```tsx
const baseline = useBaseline() // NEW — mirrors the existing useActiveScenarios() call site

useEffect(() => {
  let cancelled = false
  setStatus('loading')

  let sql: string
  if (isComparisonDiff(config.comparison)) {
    const resolvedA = resolveComparisonScenarioName(config.comparison.a, baseline)
    const resolvedB = resolveComparisonScenarioName(config.comparison.b, baseline)
    if (resolvedA === undefined || resolvedB === undefined) {
      setStatus('error') // FR-011 — panel's existing error state, no query built
      return
    }
    const compareOn = config.compare_on ?? (isZoneMap(config) ? [config.metric_id] : undefined)
    // compareOn === undefined here only if a non-zonemap panel omitted
    // compare_on — a config-authoring error, surfaced the same defined
    // way as any other missing-required-field misconfiguration (edge
    // case in spec.md).
    sql = buildComparisonDiffQuery(config.metric, resolvedA, resolvedB, compareOn!, config.comparison.expr)
  } else {
    sql = sqlExpander.expand(
      buildPanelQuery(config, filters),
      EMPTY_SUMMARIZE_CONFIG,
      filterState,
      resolveActiveScenarios(config, activeScenarioNames),
    )
  }

  query(sql).then(/* unchanged */).catch(/* unchanged */)
  return () => { cancelled = true }
}, [config, filters, activeScenarioNames, baseline]) // baseline ADDED (FR-016)
```

`isZoneMap()` is illustrative — the real per-file branch just reads `config.metric_id` directly where `ZoneMapPanelConfig` is already the known, narrowed type (`ZoneMapPanel.tsx`); `plotly`/`table`/`observable-plot`'s own versions of this effect have no `metric_id` field at all, so `compareOn` is simply `config.compare_on` there (required — see Edge Cases in spec.md for the missing-`compare_on` case).

## Null rendering contract

```ts
// formatValue.ts — NEW branch, checked before the existing typeof guard
export function formatValue(value: unknown, format: string): string {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value !== 'number') return String(value)
  // ... unchanged
}

// tableLogic.ts's cellColor() — NEW branch
export function cellColor(
  value: unknown,
  colorScale: 'sequential' | 'diverging' | undefined,
  domain: [number, number] | undefined,
): string | undefined {
  if (value === null) return NOT_COMPUTABLE_COLOR // new, dedicated, visible — never the real scale
  if (!colorScale || !domain || typeof value !== 'number') return undefined
  // ... unchanged
}
```

```ts
// observablePlotEncoding.ts's resolveObservablePlotEncoding() — NEW
// filter, corrected from this contract's own original "no code change"
// claim during implementation (research.md §6): Observable Plot's barY
// was empirically found to render a null y as a real <rect height="0">
// at the exact position a genuine 0 value would occupy — never omitted
// natively the way this contract first assumed.
const yField = config.y
const data = yField ? rows.filter((row) => row[yField] !== null) : rows
```

`plotlyTraces.ts`: genuinely **no code change** — Plotly.js's own native null-point omission was empirically confirmed (not merely assumed) to satisfy FR-014 already (research.md §6).

## Non-goals (explicitly unaffected)

- `sqlExpander.ts`'s own `$baseline.<metric>` placeholder (018) — a completely separate mechanism from this feature's `'$baseline'` sentinel in `comparison.a`/`.b`. Neither this feature nor `018` touches the other's code path.
- `valuebox`, `sankey`, `flowmap`, `markdown`, `graphic-walker` — no `comparison`/`compare_on` grammar added to any of them.
- `013-zonemap-panel`'s existing hardcoded-name `comparison: diff` tests/fixtures — zero required changes (research.md §7's identity-transformation migration).
