import { useEffect, useRef, useState } from 'react'
import * as Plot from '@observablehq/plot'
import { ChartNoAxesColumn } from 'lucide-react'

import { query, distinctValues } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import {
  buildPanelQuery,
  resolveActiveScenarios,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { resolveObservablePlotEncoding } from '@/panels/observablePlotEncoding'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { ObservablePlotPanelConfig, ObservablePlotInputConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

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

    const template = buildPanelQuery(config, filters)
    const sql = sqlExpander.expand(
      template,
      EMPTY_SUMMARIZE_CONFIG,
      filterState,
      resolveActiveScenarios(config, activeScenarios),
      inputState, // new 5th param — research.md §2
    )

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
  }, [config, filters, inputValues, activeScenarios])

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
      const width = el!.clientWidth
      const height = config.height ?? 350
      if (width === lastWidth && height === lastHeight) return
      lastWidth = width
      lastHeight = height

      const { markName, data, options, plotOptions } = resolveObservablePlotEncoding(config, rows)
      const mark = (Plot as unknown as Record<string, (d: unknown, o: unknown) => unknown>)[markName]
      if (typeof mark !== 'function') {
        setStatus('error')
        return
      }
      const plotElement = Plot.plot({
        width,
        height,
        ...plotOptions,
        marks: [mark(data, options) as unknown as Plot.Markish],
      }) as unknown as Element
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
  }, [config, rows, status])

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
  return (
    <>
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
        <div className="animate-pulse rounded-md bg-muted" style={{ height: config.height ?? 350 }} />
      )}
      <div
        ref={containerRef}
        className="observable-plot-chart"
        style={{
          width: '100%',
          // 100%, not a fixed pixel height — same reasoning PlotlyPanel.tsx
          // documents: this container is the same DOM node whether inline
          // or inside 004's expand dialog, and a hardcoded height would
          // keep the chart pinned at its small card size once relocated.
          height: '100%',
          display: status === 'ready' ? undefined : 'none',
        }}
      />
    </>
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
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span>{config.label}</span>
        <input
          type="range"
          aria-label={config.label}
          min={range?.min}
          max={range?.max}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
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
    <div className="mb-2 flex items-center gap-2 text-sm">
      <span>{config.label}</span>
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
