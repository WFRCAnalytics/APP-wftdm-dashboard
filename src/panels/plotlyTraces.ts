// Pure trace-resolution logic, deliberately separate from PlotlyPanel.tsx:
// plotly.js-dist-min references `self` (a browser global) at module-load
// time, so importing it in the Node-environment Vitest suite throws
// (`ReferenceError: self is not defined`) — even just to reach a pure
// helper function defined alongside it. Splitting this logic into its own
// module with no runtime Plotly dependency (only its TYPES, erased at
// compile time) keeps it Vitest-testable without pulling in jsdom or a
// browser shim, matching research.md §5's established Vitest/Playwright
// split — the same reasoning panelQuery.ts was already split out for.
import type * as Plotly from 'plotly.js-dist-min'

import type { PlotlyTraceConfig } from '@/layout/types'
import { resolveScenarioLabel, resolveScenarioColor, type ScenarioDisplayMap } from '@/panels/scenarioDisplay'

/** $metric.<column> -> that column's real name; the bare $scenario sentinel
 * -> 'scenario' (the column buildPanelQuery's $scenario.<metric> union adds
 * to every row). Returns undefined for a literal (non-placeholder) value —
 * the caller decides what that means for its own field. */
export function resolveColumnName(field?: string): string | undefined {
  if (!field) return undefined
  if (field === '$scenario') return 'scenario'
  const metricMatch = field.match(/^\$metric\.([A-Za-z0-9_]+)$/)
  return metricMatch ? metricMatch[1] : undefined
}

function resolveField(field: string | undefined, rows: Record<string, unknown>[]): unknown {
  const column = resolveColumnName(field)
  if (column) return rows.map((r) => r[column])
  return field // a literal (non-placeholder) value passes through as-is
}

/**
 * Resolves one PlotlyTraceConfig against a query result into one or more
 * real Plotly traces. $metric.<column>/bare-$scenario resolution (research.md
 * §3) is project-docs/SPEC.md's own dashboard-config example implemented exactly as
 * written, not literal column names.
 *
 * A `color` key, OR a `name` key that resolves to a column (most commonly
 * the bare `$scenario` sentinel — comparing scenarios is the actual use
 * case the whole $scenario.<metric> union mechanism exists for), splits
 * the config's one trace into one real Plotly trace per distinct value of
 * that column (grouped bar/line-per-category is the common case,
 * project-docs/GRAMMAR.md's own `color: $metric.mode` example). `color` wins when
 * both are set — the more specific request. `name` alone still must
 * trigger the split when color is absent: a placeholder-resolved name is
 * inherently one value per row (an array), never a valid scalar legend
 * label by itself — splitting into one trace per distinct value is what
 * makes it a valid scalar per resulting trace, not an afterthought.
 *
 * Each split trace gets its own `name` (the distinct value, for the
 * legend), its own `text` (sliced to that category's rows, same as x/y),
 * and no explicit marker.color, letting Plotly's own default palette
 * assign each trace a distinct color — a category string was never a
 * valid CSS color value to begin with.
 */
export function resolveTraces(
  trace: PlotlyTraceConfig,
  rows: Record<string, unknown>[],
  // 035-scenario-label-color: optional — every existing call site with no
  // 3rd argument behaves identically to before this feature. Only applied
  // when the split column is literally 'scenario' (the column
  // services/sqlExpander.ts's $scenario.<metric> union always produces,
  // per resolveColumnName('$scenario') above) — a split on any other
  // column (e.g. $metric.mode) is completely unaffected regardless of
  // whether scenarioDisplay is populated.
  scenarioDisplay?: ScenarioDisplayMap,
): Partial<Plotly.PlotData>[] {
  const colorColumn = resolveColumnName(trace.color)
  const nameColumn = resolveColumnName(trace.name)
  const splitColumn = colorColumn ?? nameColumn

  const xColumn = resolveColumnName(trace.x)
  const yColumn = resolveColumnName(trace.y)
  const textColumn = resolveColumnName(trace.text)

  const base = {
    type: trace.type as Plotly.PlotData['type'],
    mode: trace.mode as Plotly.PlotData['mode'],
  }

  if (!splitColumn) {
    return [
      {
        ...base,
        x: resolveField(trace.x, rows) as Plotly.Datum[],
        y: resolveField(trace.y, rows) as Plotly.Datum[],
        name: resolveField(trace.name, rows) as string,
        text: resolveField(trace.text, rows) as string[],
      },
    ]
  }

  const isScenarioSplit = splitColumn === 'scenario' && scenarioDisplay !== undefined
  const categories = [...new Set(rows.map((r) => String(r[splitColumn])))]
  return categories.map((category) => {
    // Grouping/filtering always uses the real category value (the real
    // scenario name, when isScenarioSplit) — never the resolved label
    // (FR-002/FR-003: label substitution happens only to the final `name`
    // presented to the viewer, below, after this filter has already run).
    const categoryRows = rows.filter((r) => String(r[splitColumn]) === category)
    return {
      ...base,
      name: isScenarioSplit ? resolveScenarioLabel(category, scenarioDisplay) : category,
      // 035-scenario-label-color (Part B): marker.color is set ONLY when
      // a real color resolves — an explicit `undefined` is never assigned
      // in its place, so Plotly's own default per-trace palette cycling
      // still applies exactly as it does today for an unresolved scenario
      // (FR-008) or a non-scenario split (isScenarioSplit === false).
      ...(isScenarioSplit && resolveScenarioColor(category, scenarioDisplay) !== undefined
        ? { marker: { color: resolveScenarioColor(category, scenarioDisplay) } }
        : {}),
      x: xColumn ? categoryRows.map((r) => r[xColumn] as Plotly.Datum) : undefined,
      y: yColumn ? categoryRows.map((r) => r[yColumn] as Plotly.Datum) : undefined,
      text: textColumn ? (categoryRows.map((r) => r[textColumn]) as string[]) : undefined,
    }
  })
}
