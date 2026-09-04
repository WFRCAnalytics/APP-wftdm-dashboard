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
  const data = yField ? rows.filter((row) => row[yField] !== null) : rows

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
