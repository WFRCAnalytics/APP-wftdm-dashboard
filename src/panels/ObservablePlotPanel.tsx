import { useEffect, useRef, useState } from 'react'
import * as Plot from '@observablehq/plot'
import { ChartNoAxesColumn } from 'lucide-react'

import { query, distinctValues } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useBaseline } from '@/hooks/useBaseline'
import { useColorScheme } from '@/hooks/useColorScheme'
import {
  buildComparisonDiffQuery,
  buildPanelQuery,
  isComparisonDiff,
  resolveActiveScenarios,
  resolveComparisonScenarioName,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { resolveObservablePlotEncoding } from '@/panels/observablePlotEncoding'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { ObservablePlotPanelConfig, ObservablePlotInputConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// Dark-mode contrast bug, the same established class this project has hit
// and fixed multiple times already (PlotlyPanel.tsx's own paper/plot
// background + font.color, 015-theme-toggle): @observablehq/plot's tip
// mark (the hover tooltip, config.tip: true) fills its own box with
// `var(--plot-background)` — confirmed directly against the installed
// package's real source (marks/tip.js's `defaults.fill`) — and Plot's own
// generated SVG unconditionally sets `--plot-background: white` via an
// internal, zero-specificity `:where()` stylesheet rule (plot.js), never
// reading this app's real tokens at all. The tip's TEXT is fine on its
// own (marks/tip.js sets `fill="currentColor"`, which already correctly
// inherits this app's real `--foreground`-driven text color from
// shell.tsx's own `text-foreground` class — confirmed no separate fix
// needed there) — so in dark mode the box stays hard-coded white while
// the text correctly turns white too, an invisible white-on-white
// tooltip. Fixed the proven way: resolve the real, current `--card`
// token via getComputedStyle() (mapTooltip.ts's own established choice
// of background for a floating tooltip surface in this app) and set it
// as `--plot-background` directly on this panel's own container element
// — a normal CSS custom property, inherited by whatever SVG Plot.plot()
// generates inside it via ordinary light-DOM cascade (no shadow DOM here
// to block it, unlike GraphicWalkerPanel.tsx's own unrelated shadow-host
// issue) — overriding Plot's own zero-specificity default trivially, no
// `!important` needed. Hardcoded hex fallbacks match tokens.css's own
// current light/dark `--card` values, used only if resolution somehow
// fails.
const FALLBACK_CARD = { light: '#ffffff', dark: '#081b26' } as const

/** Which view an input's own options/bounds query (and the panel's own
 * metric query) resolves to — config.scenario (singular) if set, else the
 * first currently active scenario (research.md §9: docs/GRAMMAR.md's
 * inputs: shape has no separate source:, so there is exactly one metric
 * per panel to draw options from; picking any one active scenario is a
 * deliberate simplification, not expected to differ across scenarios of
 * the same categorical column in practice). */
function resolveInputOptionsView(config: ObservablePlotPanelConfig, activeScenarios: string[]): string {
  const scenario = config.scenario ?? resolveActiveScenarios(config, activeScenarios)[0]
  return `${scenario}__${config.metric}`
}

// The fifth panel type — see contracts/observable-plot-panel.md and
// specs/007-observable-plot-panel/research.md. Unlike MarkdownPanel, this
// panel type always queries (research.md §7) — the query/fetch chain
// mirrors PlotlyPanel.tsx's shape, but the render step is a genuinely
// different model: Plot.plot() returns a brand-new detached DOM element on
// every call, with no in-place update API and no automatic container-size
// awareness, unlike Plotly.react()/responsive:true (research.md §5).
export function ObservablePlotPanel({ config }: { config: ObservablePlotPanelConfig }) {
  // Only $filters.<id> ids feed useFilterState (global reactivity) — an
  // $inputs.<id> reference in config.filter is resolved separately, below,
  // from component-local state, never subscribed to the global store
  // (research.md §2/§3, FR-005).
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)

  // Panel-local input state — isolated by construction (research.md §3):
  // this useState call is scoped to THIS component instance, so two
  // ObservablePlotPanel instances (even with identically-`id`'d inputs)
  // never share or collide. Initialized from each input's own `default`.
  const [inputValues, setInputValues] = useState<Record<string, string | string[]>>(() =>
    Object.fromEntries(
      (config.inputs ?? []).map((i) => [i.id, i.type === 'multiselect' ? [i.default] : i.default]),
    ),
  )
  const inputState = { get: (id: string) => inputValues[id] }

  // 009-scenario-manager (FR-008): reactive active-scenario set, read via
  // the useActiveScenarios() hook rather than a direct appState.getActive()
  // call — see ValueBoxPanel.tsx's own comment. Computed here (not only
  // inside the fetch effect below) because PanelLocalInput also needs
  // `view` for its own options/bounds query (research.md §9 of
  // 007-observable-plot-panel).
  const activeScenarios = useActiveScenarios()
  const view = resolveInputOptionsView(config, activeScenarios)
  // 019-baseline-diff-consumption: only consulted when config.comparison
  // references the '$baseline' sentinel — included in the fetch effect's
  // own dependency array below regardless, so a live baseline change
  // reactively re-triggers the fetch for a panel that uses it (FR-016).
  const baseline = useBaseline()
  // Read-only — which theme is currently active (011-basemap-style-system's
  // own hook). Only consulted by the --plot-background effect below; never
  // by the fetch effect, matching PlotlyPanel.tsx's own deliberate
  // exclusion of colorScheme from its query-triggering dependency array (a
  // theme flip is never a reason to hit DuckDB-WASM again).
  const colorScheme = useColorScheme()

  const containerRef = useRef<HTMLDivElement>(null)
  const plotElementRef = useRef<Element | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])

  // Fetch — re-runs on config/filters/inputValues change. Does NOT call
  // Plot.plot() itself (that happens in the render-and-swap effect below,
  // which also needs the ResizeObserver-measured container size) — this
  // effect's only job is to get `rows`/`status` right.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    // 019-baseline-diff-consumption: same isComparisonDiff()/
    // buildComparisonDiffQuery()/resolveComparisonScenarioName() shape
    // ZoneMapPanel.tsx's own reference migration establishes — a
    // '$baseline' sentinel on either side is resolved BEFORE the query is
    // built; an unresolved baseline shows this panel's existing error
    // state directly, never attempting a doomed query (FR-011).
    let sql: string
    if (isComparisonDiff(config.comparison)) {
      const diff = config.comparison
      const resolvedA = resolveComparisonScenarioName(diff.a, baseline)
      const resolvedB = resolveComparisonScenarioName(diff.b, baseline)
      if (resolvedA === undefined || resolvedB === undefined) {
        setStatus('error')
        return
      }
      // config.compare_on is required for comparison: diff on this panel
      // type (no zonemap-style metric_id default — research.md §1/§3);
      // an omitted compare_on is a config-authoring error, surfacing the
      // same defined way as any other missing-required-field
      // misconfiguration (spec.md Edge Cases).
      sql = buildComparisonDiffQuery(config.metric, resolvedA, resolvedB, config.compare_on ?? [], diff.expr)
    } else {
      const template = buildPanelQuery(config, filters)
      sql = sqlExpander.expand(
        template,
        EMPTY_SUMMARIZE_CONFIG,
        filterState,
        resolveActiveScenarios(config, activeScenarios),
        inputState, // 5th param — research.md §2 (007-observable-plot-panel)
      )
    }

    query(sql)
      .then((result) => {
        if (cancelled) return
        if (result.length === 0) {
          setStatus('empty')
          return
        }
        setRows(result)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
    // 009-scenario-manager: activeScenarios is now genuinely in this
    // effect's dependency array (previously excluded via an
    // eslint-disable-next-line — appState.getActive() was read
    // synchronously above but not tracked as a dependency at all; the
    // useActiveScenarios() hook above provides a real, stable-until-
    // changed reference, so exhaustive-deps is satisfied honestly now,
    // not suppressed).
  }, [config, filters, inputValues, activeScenarios, baseline])

  // Render-and-swap — runs when `rows`/`status` changes AND on every
  // ResizeObserver-observed container resize (research.md §5: Plot.plot()
  // has no in-place update API and no automatic container-size awareness,
  // unlike Plotly.react()/responsive:true — a real difference from
  // PlotlyPanel.tsx's cheap Plotly.Plots.resize() call, not the same fix
  // reused unchanged).
  useEffect(() => {
    const el = containerRef.current
    if (!el || status !== 'ready') return

    // ResizeObserver.observe() is spec-guaranteed to fire its callback
    // once, asynchronously, immediately — even with no actual size change
    // (research.md §5b, verified against the real W3C spec's
    // lastReportedSizes=[(-1,-1)] initialization). Without this guard, the
    // explicit render() call below AND that guaranteed initial callback
    // would each rebuild-and-swap a whole new Plot.plot() element for the
    // exact same size, every time this effect runs. The synchronous call
    // is kept (not dropped in favor of the async callback alone) so the
    // chart appears immediately when data is ready, matching
    // PlotlyPanel.tsx's no-flash behavior — the guard below makes the
    // guaranteed duplicate a no-op instead, and also filters out any later
    // spurious sub-pixel ResizeObserver firings.
    let lastWidth = -1
    let lastHeight = -1
    let renderCount = 0

    function render() {
      // Real bug, found live (not assumed): `height` used to be a hardcoded
      // `config.height ?? 350` — never actually measured, unlike `width`
      // (`el.clientWidth`). That mismatch had two real, confirmed
      // consequences: (1) in the inline card, when `config.inputs` renders
      // a PanelLocalInput row ABOVE this chart container as a sibling, the
      // container's own `height: 100%` still claims the FULL card height
      // regardless of the space that sibling row already consumes —
      // pushing the container's (and therefore the SVG's) bottom edge past
      // the card's real bottom by exactly the input row's height, a
      // genuine, visible overflow (confirmed via direct DOM measurement:
      // a 350px chart div bottom sitting ~40px past its 350px-tall
      // ancestor's own bottom edge). (2) in the 004 expand dialog, the SVG
      // stayed pinned at the small card-sized 350px regardless of the
      // dialog's real, much taller available height (554px measured) —
      // the mirror-image bug already fixed twice this session for
      // GraphicWalkerPanel.tsx/ZoneMapPanel.tsx (a hardcoded height
      // ignoring the real ancestor). Fixed on BOTH fronts at once: the
      // return JSX below now lays out inputs + chart container in a flex
      // column (`flex: 1 1 auto; min-height: 0` on the chart container
      // only) so the container's real, laid-out height correctly excludes
      // whatever space sibling inputs consume — and `height` here now
      // reads that real, already-laid-out size via `el.clientHeight`, the
      // SAME measurement method (`el.client*`) `width` already uses,
      // rather than mixing a real measurement for one axis with a
      // hardcoded fallback for the other (the exact lesson from the
      // nav-bar ResizeObserver bug earlier this session: one consistent
      // measurement method, not two that can silently disagree).
      const width = el!.clientWidth
      // `|| (config.height ?? 350)` — a real regression, caught by this
      // project's own existing test suite, not found live/manually: two
      // fixture panels configure neither `height:` nor `inputs:`, so
      // nothing in their ancestor chain (inlineAnchor/portalHost) ever
      // establishes a DEFINITE height at all — it's auto/indeterminate
      // all the way up. A flex item's `flex: 1 1 auto` inside an
      // indeterminate-height flex container has no "leftover space" to
      // grow into, so it falls back to its own natural CONTENT height —
      // which, before the SVG exists, is 0 — so `el.clientHeight` measured
      // a genuine 0 and Plot.plot() rendered a real, permanently-collapsed
      // `height="0"` SVG (confirmed via the two 019-baseline-diff-
      // consumption tests that broke). Falling back to
      // `config.height ?? 350` exactly when the real measurement is 0
      // preserves the original fallback's actual purpose (a chart with no
      // definite container height still gets a sane, visible default) —
      // it never activates for a panel with a genuine, correctly-measured
      // non-zero height, so the overflow fix above is untouched for the
      // panels that actually need it.
      const height = el!.clientHeight || (config.height ?? 350)
      if (width === lastWidth && height === lastHeight) return
      lastWidth = width
      lastHeight = height

      const { markName, data, options, plotOptions } = resolveObservablePlotEncoding(config, rows)
      const mark = (Plot as unknown as Record<string, (d: unknown, o: unknown) => unknown>)[markName]
      if (typeof mark !== 'function') {
        setStatus('error')
        return
      }

      function buildPlot(plotHeight: number): Element {
        return Plot.plot({
          width,
          height: plotHeight,
          ...plotOptions,
          marks: [mark(data, options) as unknown as Plot.Markish],
        }) as unknown as Element
      }

      let plotElement = buildPlot(height)

      // Real bug, found from a live user report (not caught by the earlier
      // overflow fix's own test coverage — this affects exactly the two
      // fixture panels with a color legend, config.fill/config.stroke,
      // e.g. "Observable Plot Mode Share (Bar)"/"Trip Length Frequency
      // Distribution" — neither of the two panels the earlier fix's own
      // tests happened to exercise has one). When
      // observablePlotEncoding.ts's plotOptions.color = {legend: true} is
      // set, Plot.plot() renders an EXTRA "swatches" element ABOVE the
      // actual chart <svg>, inside the SAME <figure> it returns — but the
      // `height` option above sizes ONLY the <svg>, never the legend. The
      // figure's REAL total rendered height is therefore
      // `(space consumed above the svg) + requested height`, exceeding
      // this container's actual available space — confirmed via direct
      // DOM measurement: the figure's real bottom edge sitting 38-50px
      // past this container's own bottom edge, visibly spilling into the
      // next row of panels below (only visible in a screenshot wide
      // enough to show past the card's own cropped bounds — a card-scoped
      // screenshot hides it entirely, which is why the earlier fix's own
      // screenshots looked correct). That consumed space isn't knowable
      // in advance (legend height depends on category count/wrapping/
      // font, PLUS its own CSS margin — measuring the legend element's
      // own getBoundingClientRect().height alone underestimated it by
      // exactly its `margin-bottom: 0.5em`, confirmed via a 5px residual
      // overflow on first attempt), so it's measured the more robust way:
      // the real, laid-out distance from the figure's own top to wherever
      // the svg itself actually starts, which captures ANY spacing above
      // it regardless of which CSS property produces it. Measured from a
      // first, temporarily-appended render and corrected with a second
      // one — a ONE-TIME correction, not a loop, since that consumed
      // space doesn't depend on the svg's own height.
      const hasLegend = Boolean((plotOptions as { color?: { legend?: boolean } }).color?.legend)
      if (hasLegend) {
        // Append temporarily so layout is real — getBoundingClientRect()
        // returns all-zero for a detached element. Replaced below by the
        // corrected final render before this effect ever yields to paint,
        // so this first pass is never visible.
        el!.append(plotElement)
        const figureEl = plotElement as HTMLElement
        const svgEl = figureEl.querySelector(':scope > svg') as HTMLElement | null
        const consumedAboveSvg = svgEl
          ? svgEl.getBoundingClientRect().top - figureEl.getBoundingClientRect().top
          : 0
        plotElement.remove()
        if (consumedAboveSvg > 0) {
          plotElement = buildPlot(Math.max(0, height - consumedAboveSvg))
        }
      }

      // Dark-mode tip-tooltip contrast fix — see this file's own top-of-file
      // comment for the full finding (marks/tip.js's own `fill: "var(--plot-
      // background)"` default, never theme-aware). Must be set DIRECTLY on
      // the actual chart <svg> element (whichever it is — `plotElement`
      // itself when there's no legend, or its `> svg` DIRECT CHILD when
      // buildPlot()/hasLegend above produced a <figure> wrapper) — NOT on
      // an ancestor. Confirmed empirically, not assumed: Plot's own
      // generated SVG carries a SELF-targeting `:where(.plot-XXXXXX) {
      // --plot-background: white; ... }` rule (plot.js) — CSS custom-
      // property inheritance is only ever a FALLBACK used when NO rule
      // declares the property on the element itself, so a rule targeting
      // the svg directly always wins over an inherited value from an
      // ancestor, REGARDLESS of that rule's specificity (a real,
      // confirmed exception to the ":where() is zero-specificity, so any
      // override wins" reasoning this codebase's own mapControls.css
      // relies on elsewhere — that reasoning only applies when two rules
      // both target the SAME element, which inheritance-vs-self-
      // declaration is not). Setting it as an inline style directly on
      // the svg itself sidesteps this entirely — inline styles beat any
      // author-stylesheet rule regardless of specificity.
      //
      // `:scope > svg`, NOT a plain unscoped `querySelector('svg')` — a
      // real bug caught during implementation (extensive live debugging,
      // not assumed correct on the first try): for a legend-bearing chart,
      // `figure.append(...legends, svg)` (plot.js) appends the legend
      // BEFORE the real chart svg — and the legend's own swatch icons are
      // THEMSELVES tiny `<svg>` elements (one per category), nested inside
      // the legend's swatches div, appearing EARLIER in document order
      // than the real chart svg. An unscoped `querySelector('svg')`
      // therefore matched the FIRST swatch icon, not the chart — this
      // codebase's own earlier overflow-fix code (directly above, in the
      // `hasLegend` block) already learned this exact lesson and correctly
      // scopes to `:scope > svg`; this fix originally didn't reuse that
      // same scoping and silently set the CSS variable on an irrelevant
      // swatch icon instead of the chart the tip mark actually renders in.
      const svgEl = (
        plotElement.tagName === 'svg' ? plotElement : plotElement.querySelector(':scope > svg')
      ) as SVGSVGElement | null
      if (svgEl) {
        const card =
          getComputedStyle(document.documentElement).getPropertyValue('--card').trim() ||
          FALLBACK_CARD[colorScheme]
        svgEl.style.setProperty('--plot-background', card)
      }

      if (plotElementRef.current) plotElementRef.current.remove()
      el!.append(plotElement)
      plotElementRef.current = plotElement

      // Test-observability instrumentation only — same category as
      // services/duckdb.ts's __debugQueryLog, not user-facing behavior.
      // Proves the guard above actually prevents the guaranteed-duplicate
      // ResizeObserver callback from rebuilding twice (research.md §5b).
      renderCount += 1
      el!.dataset.renderCount = String(renderCount)
    }

    render() // synchronous initial paint
    const observer = new ResizeObserver(render)
    observer.observe(el) // guaranteed-duplicate first callback is a no-op, per the guard above
    return () => observer.disconnect()
    // colorScheme: a theme flip carries no width/height change of its own,
    // but this effect's own lastWidth/lastHeight guard is re-initialized
    // to -1 on every re-run (fresh local variables, not refs) — so adding
    // it here correctly forces one fresh render() call per theme change
    // (to reapply the dark-mode tip-tooltip fix above), never a
    // no-op-skipped one, and never a loop (colorScheme itself doesn't
    // change as a result of rendering).
  }, [config, rows, status, colorScheme])

  // Unmount-only teardown — deliberately a second effect, empty deps.
  useEffect(() => {
    return () => {
      plotElementRef.current?.remove()
    }
  }, [])

  // Panel-local input controls render REGARDLESS of query status — a panel
  // whose current input selection produces an empty/error result must
  // still let the user change that selection (research.md §9's own
  // mismatched-default case is exactly this: the control that caused a
  // zero-row result is the one thing the user needs to see and fix). Only
  // the chart/loading/empty/error content below the controls is
  // status-dependent.
  //
  // Outer flex column (real bug fix, see the render() comment above for
  // the full finding): when `config.inputs` renders one or more
  // PanelLocalInput rows, they're normal siblings of the chart container,
  // ABOVE it in flow — a plain `height: 100%` on the chart container (this
  // panel's old shape) ignores how much space those siblings already
  // consume, since CSS percentage-height is relative to the CONTAINING
  // BLOCK, not "whatever's left over after earlier siblings." A flex
  // column fixes this at the layout level: the input rows take their own
  // natural (non-growing) height, and `flex: 1 1 auto; min-height: 0` on
  // the chart container alone means IT alone absorbs whatever space is
  // actually left — which is also what makes `el.clientHeight` in render()
  // above finally measure something real and correct in both the inline
  // card and the 004 expand dialog.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {(config.inputs ?? []).map((input) => (
        <PanelLocalInput
          key={input.id}
          config={input}
          view={view}
          value={inputValues[input.id]}
          onChange={(v) => setInputValues((prev) => ({ ...prev, [input.id]: v }))}
        />
      ))}
      {status === 'empty' && (
        <PanelEmptyState icon={ChartNoAxesColumn} message="No data for this selection" />
      )}
      {status === 'error' && <PanelErrorState message="Couldn't load this chart" />}
      {status === 'loading' && (
        <div
          className="animate-pulse rounded-md bg-muted"
          style={{ flex: '1 1 auto', minHeight: 0 }}
        />
      )}
      <div
        ref={containerRef}
        className="observable-plot-chart"
        style={{
          width: '100%',
          // flex: 1 1 auto + minHeight: 0, not height: 100% — see this
          // function's own opening comment above. Still the SAME DOM node
          // whether inline or inside 004's expand dialog (PlotlyPanel.tsx's
          // original reasoning for never hardcoding a pixel height here
          // still holds) — flex sizing is what correctly adapts it to
          // "whatever's really left over" in EITHER context, not a fixed
          // number in either.
          flex: '1 1 auto',
          minHeight: 0,
          display: status === 'ready' ? undefined : 'none',
        }}
      />
    </div>
  )
}

/**
 * Panel-local reactive input control — select/multiselect/range,
 * corresponding to docs/GRAMMAR.md's inputs: grammar. Options/bounds are
 * fetched once per (view, config.column, config.type) — never re-fetched
 * on this input's own or a sibling input's value changing, and
 * deliberately NOT filtered by any of the panel's own filter: bindings
 * (research.md §9 — a filtered options query would collapse a
 * select/multiselect's own choices down to its current selection).
 */
function PanelLocalInput({
  config,
  view,
  value,
  onChange,
}: {
  config: ObservablePlotInputConfig
  view: string
  value: string | string[] | undefined
  onChange: (value: string | string[]) => void
}) {
  const [options, setOptions] = useState<string[]>([])
  const [range, setRange] = useState<{ min: number; max: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    if (config.type === 'range') {
      query(`SELECT MIN("${config.column}") AS min, MAX("${config.column}") AS max FROM "${view}"`).then(
        (rows) => {
          if (!cancelled && rows[0]) {
            setRange({ min: Number(rows[0].min), max: Number(rows[0].max) })
          }
        },
      )
    } else {
      distinctValues(view, config.column).then((values) => {
        if (!cancelled) setOptions(values.map(String))
      })
    }
    return () => {
      cancelled = true
    }
  }, [view, config.column, config.type])

  // Corrects research.md §9's original claim: the browser clamps only the
  // <input type="range">'s own DISPLAYED value to [min, max] — it does
  // NOT call onChange for that automatic clamping, so a React-controlled
  // `value` prop left at an out-of-range default (e.g. "99") would
  // silently diverge from what the slider visibly shows (e.g. "5"), and
  // the query driving this panel would keep using the invisible,
  // never-corrected "99" — not what the user sees selected. Once the
  // real bounds are known, actively sync `value` to the same clamped
  // number the widget already displays, so the query and the visible
  // slider position always agree. Converges in one extra render (once
  // `value` matches the clamp target, this becomes a no-op) — never
  // loops.
  useEffect(() => {
    if (config.type !== 'range' || !range || typeof value !== 'string') return
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return
    const clamped = Math.min(Math.max(numeric, range.min), range.max)
    if (clamped !== numeric) onChange(String(clamped))
  }, [config.type, range, value, onChange])

  if (config.type === 'range') {
    // aria-label, not a wrapping <label>Text<input> — a wrapping label's
    // accessible-name computation composes the control's own rendered
    // content into the label text (a real browser accname-algorithm
    // quirk, not consistently just "the label text"), making it an
    // unreliable target for anything that queries by accessible name.
    // Explicit aria-label sidesteps that ambiguity entirely.
    //
    // A mismatched `default`'s DISPLAYED position is clamped to [min, max]
    // automatically by the browser's own <input type="range"> behavior;
    // the effect above syncs the underlying value to match (see its own
    // comment) so the query stays consistent with what's shown.
    return (
      <div className="mb-2 flex items-center gap-2 text-sm text-foreground">
        <span>{config.label}</span>
        <input
          type="range"
          aria-label={config.label}
          min={range?.min}
          max={range?.max}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="accent-primary"
        />
      </div>
    )
  }

  // select/multiselect: the current value is always rendered as a real
  // <option>, even when the fetched `options` list doesn't contain it
  // (research.md §9's edge-case resolution) — so the control visibly
  // reflects what's actually selected (and therefore what's actually
  // driving the query) rather than silently falling back to whichever
  // <option> the browser picks when the bound value matches none of them.
  // The underlying query still legitimately empties out in that case
  // (PanelEmptyState), same as any other unmatched filter value.
  const currentValues = Array.isArray(value) ? value : value ? [value] : []
  const displayOptions = [...new Set([...options, ...currentValues])]

  return (
    <div className="mb-2 flex items-center gap-2 text-sm text-foreground">
      <span>{config.label}</span>
      {/* Previously entirely unstyled — a real, confirmed dark-mode bug:
          native <select>/<option> chrome (including the OS-rendered
          dropdown popup, which no CSS class can reach) follows the
          color-scheme property, not this app's own tokens — fixed in
          tokens.css. The classes below are this control's own first real
          styling pass, matching Button's own border/background/radius/
          focus-ring convention (components/ui/button.tsx's outline
          variant) so it reads as part of this app's design system rather
          than a bare browser default, in either theme. */}
      <select
        aria-label={config.label}
        multiple={config.type === 'multiselect'}
        value={value ?? (config.type === 'multiselect' ? [] : '')}
        onChange={(e) => {
          if (config.type === 'multiselect') {
            onChange(Array.from(e.target.selectedOptions, (o) => o.value))
          } else {
            onChange(e.target.value)
          }
        }}
        className="rounded-md border border-input bg-background px-2 py-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {displayOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
