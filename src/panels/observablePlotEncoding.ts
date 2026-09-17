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

// OBSERVABLE-PLOT-THEMING-PROPOSAL.md §5e — this app's own real,
// WCAG-contrast-verified categorical palette (tokens.css), the same 5
// tokens RechartsPanel/rechartsEncoding.ts already cycle through. Used
// below for a non-scenario categorical fill/stroke channel, replacing
// Plot's own raw (non-contrast-adjusted) schemeObservable10 default.
const CHART_COLOR_TOKENS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

/**
 * x/y/fill/stroke/facet_x/facet_y are literal column names — NOT
 * $metric.<column>-prefixed (research.md §4, confirmed against
 * project-docs/GRAMMAR.md's own observable-plot examples, in explicit contrast to
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
  // OBSERVABLE-PLOT-THEMING-PROPOSAL.md §5a: fontFamily added alongside
  // the existing fontSize fix. Plot's own plot.js sets
  // `svg.attr("font-family", "system-ui, sans-serif")` as an SVG
  // presentation attribute (confirmed via direct source read,
  // plot.js:254) — this establishes the *specified* value of that
  // inherited property on the <svg> itself, which beats inheriting this
  // app's real `body { font-family: var(--font-body) }` from further up
  // the DOM (a presentation attribute only loses to an actual rule
  // targeting the SAME element, never to an ancestor's inherited value).
  // Without this, every Observable Plot panel renders in the browser's
  // system-ui stack, never this app's real "Geist Variable" — true since
  // 007-observable-plot-panel shipped; the fontSize-only fix above never
  // touched font-family at all. `var(--font-body)` resolves natively
  // wherever it's referenced (no getComputedStyle() round-trip needed,
  // unlike the --plot-background dark-mode fix below, which resolves a
  // token value into a literal hex string specifically because Plot's own
  // generated stylesheet re-declares --plot-background itself and would
  // otherwise win).
  plotOptions.style = { fontSize: '12px', fontFamily: 'var(--font-body)' }
  if (config.grid) plotOptions.grid = config.grid
  // project-docs/GRAMMAR.md documents no legend: key at all for this panel type —
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
  if (config.fill || config.stroke) {
    plotOptions.color = {
      legend: true,
      // OBSERVABLE-PLOT-THEMING-PROPOSAL.md §5b — Plot's own legend
      // options API, confirmed via direct source trace (plot.js →
      // legends.js's createLegends()/legendColor() → legends/swatches.js's
      // legendItems()): this plotOptions.color object is forwarded
      // WHOLE to legendItems(), which destructures `style`/`swatchSize`
      // directly off it and ends with `.call(applyInlineStyles, style)`
      // on the legend's own container div — no DOM patching needed here,
      // unlike the tooltip (§5c) and the swatch corner-radius fix below,
      // neither of which has an equivalent declarative option. Before:
      // the legend renders in its OWN self-contained, hardcoded
      // `10px system-ui, sans-serif` (legends/swatches.js's own scoped
      // <style> block) with no text color set at all — never touched by
      // the chart-body fix above, since the legend is a DOM SIBLING of
      // <svg> (Plot's own figure.append(...legends, svg)), not a
      // descendant, so CSS inheritance never reaches it either. After:
      // matches the chart body (fontFamily/fontSize above) and
      // RechartsPanel's own ChartLegendContent text color
      // (`text-muted-foreground`) exactly.
      style: { fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)' },
      // 15px (Plot's own legendItems() `swatchSize = 15` default) → 9px,
      // matching RechartsPanel's own 8px `h-2 w-2` legend swatch as
      // closely as this mark-independent, real-rendered-<svg>-per-swatch
      // shape allows (Plot's swatch is drawn as its own <svg><rect>, not
      // a plain CSS-sizable <div> — an odd size vs. Recharts' round 8px
      // is not perceptible at this scale, unlike 15px vs 8px today).
      swatchSize: 9,
    }
  }

  // Real, confirmed bug fix (grouped-vs-stacked bar investigation): Plot's
  // own documented grouped-bar recipe (bar.md — "For a grouped bar chart,
  // use faceting") facets by the real category (facet_x/facet_y) and puts
  // the comparison dimension on x, matching its own fill/stroke channel.
  // Left as-is, this renders every facet's own x-axis tick labels too —
  // literally the same handful of category values (e.g. every scenario
  // name) repeated once per facet, overlapping into illegible text
  // (confirmed live via screenshot: a facet_x-scenario grouped bar chart
  // with real scenario names rendered as solid black smear along the
  // bottom). The color legend already names each x position exactly once;
  // repeating it as x-axis text under every facet is pure redundancy, not
  // information. Plot's own official example for this exact pattern
  // (`Plot.barX(penguins, {fy: "island", y: "sex", x: 1, inset: 0.5})`)
  // suppresses it too, via a top-level `label: null` — done here more
  // narrowly (only the x axis, not every axis, since this app's y-axis
  // value labels stay genuinely useful) and only for the specific
  // grouped-bar-via-facet shape: a facet is set AND x is the same field as
  // fill/stroke (the color channel), never for any other facet_x/facet_y
  // usage this panel type supports.
  // `plotOptions.x`, NOT `options.x` — `options` holds this mark's own
  // per-channel bindings (`options.x = config.x` above is the literal
  // COLUMN NAME driving position, e.g. "scenario"; overwriting it with an
  // object here would break that binding entirely, not just hide the
  // axis). `x: {axis: null}` is a top-level Plot.plot() SCALE option,
  // same family as `y`/`fx`/`fy` — it only suppresses the rendered axis,
  // leaving the channel binding above completely untouched.
  const hasFacet = Boolean(config.facet_x || config.facet_y)
  const xMatchesColorChannel = Boolean(config.x) && (config.x === config.fill || config.x === config.stroke)
  const xAxisSuppressed = hasFacet && xMatchesColorChannel
  if (xAxisSuppressed) {
    plotOptions.x = { axis: null }
  }

  // Real, confirmed visual bug: Plot's own default bottom-axis marginBottom
  // (30px — axis.js's own `marginBottom = anchor === "bottom" ? 30 : 0`
  // default) was sized for Plot's own 10px default tick-label font, not the
  // 12px this panel's plotOptions.style override above renders at (matched
  // to PlotlyPanel.tsx's own 12px default, see that assignment's own
  // comment) — and Plot never recomputes it from the actual rendered font
  // size. Confirmed directly against axis.js's own label-placement code
  // (labelOptions()): for a categorical/band scale specifically (every real
  // observable-plot bar chart in this app — barY's x/fx channel is always
  // discrete), the axis TITLE's own default labelAnchor is "center", not
  // "right" — so it renders CENTERED DIRECTLY BELOW the tick labels, not
  // off to the side of the axis the way it does for a continuous scale —
  // and its vertical offset defaults to `marginBottom - 3` (27px from the
  // axis line) while the tick labels themselves start 9px below that same
  // line (tickSize + tickPadding). With a 12px tick label filling most of
  // that remaining 18px band, the title text sits only a few px below the
  // tick text (confirmed empirically: a real live render measured the
  // title's top edge 4.5px ABOVE the tick label's own bottom edge — a
  // genuine overlap, not merely "close").
  //
  // A real, confirmed FIRST-DRAFT bug of this very fix, caught via a live
  // screenshot of this app's own real, published "grouped bar chart via
  // facet" content (facet_x + x matching fill/stroke, xAxisSuppressed
  // above): that pattern's own bottom-anchored axis is the FACET's fx-axis
  // (config.facet_x), not the ordinary x-axis suppressed above — Plot's
  // axis.js reuses the exact same axisKx()/labelOptions() code path for
  // k="x" and k="fx" verbatim, so the fx-axis title suffers the identical
  // crowding bug, independently of whether the x-axis itself renders at
  // all. An earlier version of this fix only bumped marginBottom in the
  // (config.x && !xAxisSuppressed) case, silently missing every real
  // grouped-bar-via-facet panel — exactly the case a live user report
  // caught this on. Bumped to 44px whenever EITHER a real x-axis title
  // (config.x, not suppressed above) OR a facet axis title (config.facet_x)
  // will actually render — both share the same marginBottom-derived
  // labelOffset, so both need the same extra room.
  if ((Boolean(config.x) && !xAxisSuppressed) || Boolean(config.facet_x)) {
    plotOptions.marginBottom = 44
  }

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
  } else {
    // OBSERVABLE-PLOT-THEMING-PROPOSAL.md §5e — the non-scenario
    // categorical case (e.g. real, published fill: tour_mode /
    // fill: primary_purpose / fill: school_segment panels, confirmed via
    // a direct grep of every real public/demo-dashboard-config/*.yaml
    // observable-plot panel before writing this branch — every one of
    // them falls straight through the isScenarioColor branch above,
    // untouched, since none of them uses fill/stroke: scenario).
    // Deliberately gated on `colorField !== 'scenario'` so this can never
    // run for a scenario-colored panel even when scenarioDisplay is
    // undefined (e.g. a panel rendered before that hook resolves) —
    // 035-scenario-label-color's own domain/range branch above stays the
    // only code path that ever colors a `scenario` channel, matching its
    // own "fall back to Plot's default when unresolved" contract
    // (FR-008) exactly as before this feature.
    //
    // Without this, Plot's own implicit-ordinal default scheme
    // ("observable10", scales/ordinal.js:42) already happens to be the
    // SAME palette family this app's own --chart-1..5 tokens were
    // derived from — but not byte-identical: --chart-1..5 were
    // separately lightness-adjusted for WCAG 3:1 non-text contrast
    // (rechartsPanel.css's own recorded history), Plot's raw
    // schemeObservable10 was not. This branch replaces Plot's own raw
    // scheme with this app's real, already-verified tokens whenever a
    // categorical fill/stroke channel exists, matching RechartsPanel's
    // own --chart-1..5 cycling (rechartsEncoding.ts) exactly, the same
    // "all-or-nothing explicit range" mechanism the scenario branch above
    // already established (Plot's color scale has no partial-override
    // mode — research.md §4 of 035, re-confirmed here).
    const colorField = config.fill ?? config.stroke
    if (colorField && colorField !== 'scenario') {
      const distinctValues: string[] = []
      const seen = new Set<string>()
      for (const row of filteredRows) {
        const value = String(row[colorField])
        if (!seen.has(value)) {
          seen.add(value)
          distinctValues.push(value)
        }
      }
      if (distinctValues.length > 0) {
        plotOptions.color = {
          ...(typeof plotOptions.color === 'object' ? plotOptions.color : {}),
          domain: distinctValues,
          range: distinctValues.map((_, i) => CHART_COLOR_TOKENS[i % CHART_COLOR_TOKENS.length]),
        }
      }
    }
  }

  return { markName: config.mark, data, options, plotOptions }
}

/**
 * `config.tip: true` (project-docs/GRAMMAR.md's only documented value — a plain
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
 * rather than exposing yet another author-facing key `project-docs/GRAMMAR.md`
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
