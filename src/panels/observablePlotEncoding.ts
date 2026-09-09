// Pure, DOM-free encoding resolution — never imports @observablehq/plot at
// runtime and never calls a DOM API (research.md §4/§6). Confirmed against
// @observablehq/plot's real source (unlike plotly.js-dist-min) that
// importing it doesn't reference a browser global at module load time —
// but Plot.plot() itself constructs real SVG/HTML DOM nodes, which this
// project's Vitest config (environment: 'node') has no DOM for. Keeping
// this module's output a plain object, never a real Plot mark or plotted
// element, means it needs no DOM at all — mirroring plotlyTraces.ts's own
// reason for being split out of PlotlyPanel.tsx. Only ObservablePlotPanel.tsx
// itself ever calls Plot[markName](data, options).
import type { ObservablePlotPanelConfig } from '@/layout/types'
import { resolveScenarioColor, resolveScenarioLabel, type ScenarioDisplayMap } from '@/panels/scenarioDisplay'

export interface ResolvedObservablePlotEncoding {
  markName: string
  data: Record<string, unknown>[]
  options: Record<string, unknown>
  plotOptions: Record<string, unknown>
}

/**
 * x/y/fill/stroke/facet_x/facet_y are literal column names — NOT
 * $metric.<column>-prefixed (research.md §4, confirmed against
 * docs/GRAMMAR.md's own observable-plot examples, in explicit contrast to
 * type: plotly's traces, whose x/y ARE $metric.-prefixed). Only keys
 * actually present on `config` are copied through, so Plot's own per-mark
 * defaults apply to anything the author omitted — no key is ever set to
 * `undefined` (Plot treats an explicit undefined differently from an
 * absent key for some options).
 */
export function resolveObservablePlotEncoding(
  config: ObservablePlotPanelConfig,
  rows: Record<string, unknown>[],
  // 035-scenario-label-color: optional — every existing call site with no
  // 3rd argument behaves identically to before this feature. Only applied
  // when fill/stroke is literally 'scenario'.
  scenarioDisplay?: ScenarioDisplayMap,
): ResolvedObservablePlotEncoding {
  const options: Record<string, unknown> = {}
  if (config.x) options.x = config.x
  if (config.y) options.y = config.y
  if (config.fill) options.fill = config.fill
  if (config.stroke) options.stroke = config.stroke
  if (config.facet_x) options.fx = config.facet_x
  if (config.facet_y) options.fy = config.facet_y
  if (config.tip) options.tip = resolveTipMode(config.mark)

  const plotOptions: Record<string, unknown> = {}
  // Real, confirmed visual bug: @observablehq/plot's own default rendered
  // font-size is 10px (confirmed empirically via getComputedStyle() on a
  // live rendered chart's own axis-tick <text> element — not merely
  // assumed from docs), while PlotlyPanel.tsx's charts render at Plotly's
  // own default of 12px (PlotlyPanel.tsx sets no explicit layout.font.size
  // at all — confirmed by direct read — so 12px is Plotly's own library
  // default, also confirmed live the same way). The two charting panel
  // types sitting side by side with visibly different text sizes reads as
  // an inconsistency, not an intentional design choice — matched here via
  // Plot.plot()'s own top-level `style` option (a CSSStyleDeclaration-
  // shaped object, confirmed against the installed package's own
  // plot.d.ts), the documented way to override Plot's default styling,
  // rather than fighting it after the fact with an external CSS override.
  // `12` is Plotly's own real, live-confirmed rendered default — not a
  // guessed pixel value in isolation.
  plotOptions.style = { fontSize: '12px' }
  if (config.grid) plotOptions.grid = config.grid
  // docs/GRAMMAR.md documents no legend: key at all for this panel type —
  // confirmed by a full grep of both real observable-plot examples and the
  // rest of the file (a real, third potential gap checked for, not
  // assumed absent). @observablehq/plot's own color: {legend: true} is
  // confirmed a top-level Plot.plot() option (belongs in plotOptions,
  // alongside grid — not a per-mark option) and confirmed NOT automatic:
  // a fill/stroke channel with no explicit legend option shows no legend
  // at all. Since there is no author-facing key to opt in with, showing
  // one whenever a categorical color channel exists is the only reachable
  // default — and matches this app's own PlotlyPanel, whose Plotly.js
  // legend already shows automatically whenever a color/name split
  // produces multiple traces, keeping the two charting panel types
  // visually consistent (a real hover/legend gap found via manual visual
  // check, not covered when this feature originally shipped).
  if (config.fill || config.stroke) plotOptions.color = { legend: true }

  // 019-baseline-diff-consumption (FR-014): a real, confirmed finding —
  // research.md §6 originally assumed Observable Plot's own native
  // null-handling omits a null-valued mark the same way Plotly's does.
  // Empirically false for barY specifically: a null y renders as a real
  // <rect height="0"> at the EXACT position a genuine 0 value would
  // occupy — visually indistinguishable from "no change," which is
  // exactly the silent-coercion-to-0 outcome FR-014 forbids. Rather than
  // special-case per mark type (whether lineY's own null-handling truly
  // differs was not exhaustively re-verified either), rows with a null
  // value on the configured y channel are filtered out here,
  // unconditionally — a genuine omission, matching the visual guarantee
  // FR-014 requires uniformly across every mark type this panel type
  // supports, not a behavior this app merely hopes each mark honors on
  // its own.
  const yField = config.y
  const filteredRows = yField ? rows.filter((row) => row[yField] !== null) : rows

  // 035-scenario-label-color: unlike plotly/recharts, Observable Plot
  // reads legend/axis/facet text DIRECTLY from each row's own cell value
  // — there is no separate "trace name"/"chart config label" field to
  // substitute into instead (research.md §5). Safe under FR-002/FR-003:
  // by this point the SQL query has already completed and nothing
  // downstream of this function re-joins/re-filters by the real name — a
  // fresh row copy is built here (filteredRows itself, and the ORIGINAL
  // `rows` passed in, are never mutated).
  const isScenarioColor = (config.fill === 'scenario' || config.stroke === 'scenario') && scenarioDisplay !== undefined
  const data = isScenarioColor
    ? filteredRows.map((row) => ({ ...row, scenario: resolveScenarioLabel(String(row.scenario), scenarioDisplay) }))
    : filteredRows

  if (isScenarioColor) {
    // Observable Plot's own color scale is all-or-nothing: an explicit
    // `range` array replaces Plot's built-in default categorical cycling
    // for the WHOLE scale, with no way to mix "use my resolved color for
    // category A" and "fall back to your own default cycle color for
    // category B" (research.md §4). So domain/range are only set when
    // EVERY distinct real scenario present resolves to a color — 1 unresolved
    // scenario means neither is set, and the WHOLE panel falls back to
    // Plot's own existing default cycling, unchanged from today (FR-008).
    const distinctRealNames: string[] = []
    const seen = new Set<string>()
    for (const row of filteredRows) {
      const realName = String(row.scenario)
      if (!seen.has(realName)) {
        seen.add(realName)
        distinctRealNames.push(realName)
      }
    }
    const resolvedColors = distinctRealNames.map((name) => resolveScenarioColor(name, scenarioDisplay))
    if (distinctRealNames.length > 0 && resolvedColors.every((c) => c !== undefined)) {
      plotOptions.color = {
        ...(typeof plotOptions.color === 'object' ? plotOptions.color : {}),
        domain: distinctRealNames.map((name) => resolveScenarioLabel(name, scenarioDisplay)),
        range: resolvedColors,
      }
    }
  }

  return { markName: config.mark, data, options, plotOptions }
}

/**
 * `config.tip: true` (docs/GRAMMAR.md's only documented value — a plain
 * boolean, not an orientation string) does NOT resolve to identical
 * runtime behavior across mark types. Confirmed directly against
 * @observablehq/plot's real source (src/mark.js's `maybeTip`): the
 * boolean `true` always maps to Plot's `"xy"` (two-dimensional) pointer
 * mode, with no mark-shape awareness of its own. Plot's own docs warn
 * that 2D pointing creates "dead spots" on bar/rect-shaped marks — the
 * pointer must land within ~40px of a bar's *centroid*, not anywhere on
 * its visible area — and recommend one-dimensional `"x"`/`"y"` pointing
 * for those shapes instead. A user hovering "on" a bar and getting no
 * tooltip for most of its visible area reads as "the tooltip doesn't
 * work," not a deliberate precision feature — the same symptom
 * `config.tip` exists to prevent, so this app resolves it internally
 * rather than exposing yet another author-facing key `docs/GRAMMAR.md`
 * doesn't document. `barY` — the one bar-shaped mark this app currently
 * supports, x holding the discrete category, y the continuous value —
 * gets `"x"` (any hover position within a bar's column triggers it,
 * matching Plot's own recommendation). Every other mark (today: `lineY`,
 * whose own docs example uses `tip: true` directly) keeps the "xy"
 * default, which is already correct for point/line-based marks.
 */
function resolveTipMode(mark: string): true | 'x' {
  return mark === 'barY' ? 'x' : true
}
