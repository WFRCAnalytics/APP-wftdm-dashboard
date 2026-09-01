# Contract: `ObservablePlotPanel` (`src/panels/ObservablePlotPanel.tsx`)

Satisfies: FR-001 through FR-011. The fifth panel type — follows
`contracts/plotly-panel.md`'s config → query → render shape (unlike
`contracts/markdown-panel.md`, this panel type always queries — research.md
§7), but with a genuinely different rendering model (research.md §5/§5b) and
a new panel-local input-state layer (research.md §3/§9) neither prior
contract needed. `extractGlobalFilterIds` and `PanelLocalInput` below are
this feature's two actually novel pieces — correctly separating `$filters.`
from `$inputs.` references inside one `filter:` map, and this application's
first working `select`/`multiselect`/`range` controls — and are given full,
non-illustrative bodies rather than sketched.

## Shape — pure encoding resolution (`src/panels/observablePlotEncoding.ts`)

```ts
// Pure, DOM-free — never imports @observablehq/plot at runtime, never calls
// a DOM API (research.md §4/§6). Vitest-testable in `environment: 'node'`
// with zero DOM shim, the same reasoning plotlyTraces.ts/tableLogic.ts were
// already split out for.
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
 * type: plotly's traces). Only keys actually present on `config` are
 * copied through, so Plot's own per-mark defaults apply to anything the
 * author omitted.
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
  if (config.tip) options.tip = config.tip

  const plotOptions: Record<string, unknown> = {}
  if (config.grid) plotOptions.grid = config.grid

  return { markName: config.mark, data: rows, options, plotOptions }
}
```

## Shape — component (`src/panels/ObservablePlotPanel.tsx`)

```tsx
import { useEffect, useRef, useState } from 'react'
import * as Plot from '@observablehq/plot'
import { ChartNoAxesColumn } from 'lucide-react'

import { query, distinctValues } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import * as appState from '@/state/appState'
import { useFilterState } from '@/hooks/useFilterState'
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

/** Which view an input's own options query (and the panel's own metric
 * query) resolves to — config.scenario (singular) if set, else the first
 * currently active scenario (research.md §9: docs/GRAMMAR.md's `inputs:`
 * shape has no separate `source:`, so there is exactly one metric per
 * panel to draw options from; picking any one active scenario is a
 * deliberate simplification, not expected to differ across scenarios of
 * the same categorical column in practice). */
function resolveInputOptionsView(config: ObservablePlotPanelConfig, activeScenarios: string[]): string {
  const scenario = config.scenario ?? resolveActiveScenarios(config, activeScenarios)[0]
  return `${scenario}__${config.metric}`
}

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
  // never share or collide. Initialized from each input's own `default` —
  // a multiselect input's initial value is wrapped in a single-element
  // array (`[i.default]`), not the bare string every other type uses,
  // matching the array shape a multiselect's onChange always produces
  // (found necessary during implementation — a bare string here left a
  // multiselect's <select multiple> in an invalid controlled-value state
  // on first render).
  const [inputValues, setInputValues] = useState<Record<string, string | string[]>>(() =>
    Object.fromEntries(
      (config.inputs ?? []).map((i) => [i.id, i.type === 'multiselect' ? [i.default] : i.default]),
    ),
  )
  const inputState = { get: (id: string) => inputValues[id] }

  // Read once per render, same as PlotlyPanel.tsx's own inline reads of
  // appState — a synchronous store read, not an async fetch. Computed
  // here (not only inside the fetch effect below) because PanelLocalInput
  // also needs `view` for its own options/bounds query (research.md §9).
  const activeScenarios = appState.getActive().map((s) => s.name)
  const view = resolveInputOptionsView(config, activeScenarios)

  const containerRef = useRef<HTMLDivElement>(null)
  const plotElementRef = useRef<Element | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])

  // Fetch — re-runs on config/filters/inputValues change. Does NOT call
  // Plot.plot() itself (that happens in the render-and-swap effect below,
  // which also needs the ResizeObserver-measured container size) — this
  // effect's only job is to get `rows` and `status` right.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, filters, inputValues])

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
    // lastReportedSizes=[(-1,-1)] initialization). Without this guard,
    // the explicit render() call below AND that guaranteed initial
    // callback would each rebuild-and-swap a whole new Plot.plot()
    // element for the exact same size, every time this effect runs. The
    // synchronous call is kept (not dropped in favor of the async
    // callback alone) so the chart appears immediately when data is
    // ready, matching PlotlyPanel.tsx's no-flash behavior — the guard
    // below makes the guaranteed duplicate a no-op instead, and also
    // filters out any later spurious sub-pixel ResizeObserver firings.
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

  // Unmount-only teardown.
  useEffect(() => {
    return () => {
      plotElementRef.current?.remove()
    }
  }, [])

  // Panel-local input controls render REGARDLESS of query status — found
  // necessary during implementation, not part of the original sketch:
  // gating them behind status === 'ready' (the original draft's shape)
  // means a panel whose CURRENT input selection produces an empty/error
  // result hides the one control the user needs to fix it — exactly
  // research.md §9's own mismatched-default case. Only the chart/loading/
  // empty/error content below the controls is status-dependent.
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
        style={{ width: '100%', height: '100%', display: status === 'ready' ? undefined : 'none' }}
      />
    </>
  )
}
```

## Shape — `panelQuery.ts`'s new `extractGlobalFilterIds` export

```ts
const FILTERS_REF_RE = /^\$filters\.([A-Za-z0-9_]+)$/

/**
 * Extracts every $filters.<id> referenced by config.filter, in either
 * shape (research.md §1). $inputs.<id> entries are deliberately excluded
 * — those are panel-local (research.md §3) and must never be subscribed
 * to via useFilterState, which would make them globally visible/reactive
 * in exactly the way FR-005 forbids.
 */
export function extractGlobalFilterIds(filter: DataBoundPanelConfigBase['filter']): FilterId[] {
  if (!filter) return []
  if (typeof filter === 'string') {
    const match = filter.match(FILTERS_REF_RE)
    return match ? [match[1]] : []
  }
  return Object.values(filter)
    .map((value) => value.match(FILTERS_REF_RE)?.[1])
    .filter((id): id is string => id !== undefined)
}
```

## Shape — `PanelLocalInput` (defined alongside `ObservablePlotPanel` in the same file)

```tsx
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
  // Options/bounds are fetched once per (view, config.column) pair — never
  // re-fetched on this input's own or a sibling input's value changing,
  // and deliberately NOT filtered by any of the panel's own `filter:`
  // bindings (research.md §9 — a filtered options query would collapse a
  // select/multiselect's own choices to its current selection).
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

  // Corrects the original sketch's "no application code needed" claim
  // for range clamping (research.md §9, updated): the browser clamps only
  // the <input type="range">'s own DISPLAYED value — it fires no
  // change/input event for that automatic clamping, so a React-controlled
  // `value` prop left at an out-of-range default would silently diverge
  // from what the slider visibly shows, and the query driving this panel
  // would keep using the stale, never-corrected value. Once the real
  // bounds are known, this effect actively syncs `value` to the same
  // clamped number the widget already displays. Converges in one extra
  // render (once `value` matches the clamp target, this is a no-op) —
  // never loops.
  useEffect(() => {
    if (config.type !== 'range' || !range || typeof value !== 'string') return
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return
    const clamped = Math.min(Math.max(numeric, range.min), range.max)
    if (clamped !== numeric) onChange(String(clamped))
  }, [config.type, range, value, onChange])

  if (config.type === 'range') {
    // aria-label, not a wrapping <label>Text<input> — found necessary
    // during implementation: a wrapping label's accessible-name
    // computation composes the control's own rendered content into the
    // label text (a real browser accname-algorithm quirk), making a
    // wrapping <label> an unreliable target for anything that queries by
    // accessible name (e.g. Playwright's getByLabel). Explicit aria-label
    // sidesteps that ambiguity entirely; {config.label} is still rendered
    // visibly as a sibling <span>.
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
  // <option> the browser picks when the bound value matches none of
  // them. The underlying query still legitimately empties out in that
  // case (PanelEmptyState), same as any other unmatched filter value.
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
```

(Illustrative — the load-bearing contract is: `resolveObservablePlotEncoding`
is never called with a DOM in the loop and `Plot.plot()`/DOM manipulation
happen only inside `ObservablePlotPanel.tsx` itself; the fetch effect and the
render-and-swap effect are two separate effects — fetch depends on
`[config, filters, inputValues]`, render-and-swap depends on `[config, rows,
status]` plus its own `ResizeObserver` and its own last-rendered-size guard
(research.md §5b), mirroring `PlotlyPanel.tsx`'s two-effect split in spirit
while diverging in what each effect actually does, per research.md §5;
`inputValues` is `useState`, never written to `state/filterState.ts`;
`sqlExpander.expand()`'s new 5th parameter is always passed, even when
`config.inputs` is empty, so the function signature stays uniform across
every call site that might one day need it; `extractGlobalFilterIds` and
`PanelLocalInput`'s option/bounds fetch both deliberately exclude every
`filter:` binding — not merely the input's own — from the query they issue,
per research.md §9; each `PanelLocalInput` receives `view` — the same
`resolveInputOptionsView()` result `ObservablePlotPanel` computes once and
passes to every declared input, not recomputed per input; panel-local input
controls render unconditionally — never gated behind query `status` — found
necessary during implementation, not part of the original sketch, since a
panel whose current input selection produces an empty/error result must
still expose the control that caused it; the range input's clamp-sync
effect, also found necessary during implementation, keeps the query in
step with what the slider visibly shows once real bounds are known.)

`config.title`/`config.width`/`config.height` flow through `panelCard.tsx`
exactly like every other panel type. `004`'s `usePanelExpandHost` wraps this
component exactly like it wraps `PlotlyPanel`/`TablePanel` — same mounted
instance, inline vs. dialog is a visual relocation only; the
`ResizeObserver`-driven render-and-swap above is what makes that relocation
render at the correct size (FR-007), not `usePanelExpandHost` itself.

## Given/When/Then

- **Given** an `ObservablePlotPanelConfig` with `mark: barY`, `x`, `y` bound
  to columns present in the queried result, **when** the panel mounts,
  **then** the rendered chart's marks match a direct SQL query against the
  same data (FR-001/FR-002, US1, SC-001).
- **Given** the same panel, **when** the global filter its `filter:` map
  references changes value, **then** the panel re-queries and re-renders,
  without any other panel or the global filter store's other subscribers
  being affected beyond their own subscriptions (FR-003, US1).
- **Given** a rendered panel, **when** the user expands it via `004`'s
  mechanism, **then** the chart re-renders at the dialog's larger size with
  correct proportions — not stretched, clipped, or still card-sized — and
  collapsing it returns the original card-sized rendering intact, with zero
  additional query issued solely by that transition (FR-007/FR-009, US1,
  SC-003).
- **Given** a panel's query returns zero rows, **when** it renders, **then**
  `PanelEmptyState` appears (FR-008, US1, SC-004).
- **Given** a panel's `metric` does not resolve to a registered view, **when**
  its query rejects, **then** `PanelErrorState` appears (FR-008, US1,
  SC-004).
- **Given** a panel with a `select`-type input in `inputs:`, **when** the
  panel first mounts, **then** its query uses that input's `default` value
  before any user interaction (FR-004/FR-006, US2).
- **Given** the same panel, **when** the user picks a different option,
  **then** only this panel re-queries and re-renders, using the newly
  selected value for `$inputs.<id>` (FR-004/FR-005, US2, SC-002).
- **Given** a `multiselect`-type input with more than one value selected,
  **when** the panel queries, **then** rows matching *any* selected value are
  included (FR-004, US2).
- **Given** two `observable-plot` panels on the same tab, each with its own
  `inputs:` (including a case where both declare the same input `id`),
  **when** the user changes one panel's input value, **then** the other
  panel's chart, input controls, and the global filter store are all
  unaffected (FR-005, US2, SC-002).
- **Given** a panel with a non-default input value set, **when** the user
  expands it into `004`'s dialog and closes it again, **then** the input's
  current value (not its `default`) is still in effect, and no query was
  triggered solely by that transition (FR-006, US2).
- **Given** a dashboard tab combining `valuebox`/`plotly`/`table`/`markdown`/
  `observable-plot` panels, **when** the tab loads, **then** every panel
  renders without error and the `observable-plot` panel's card chrome/expand
  trigger match the others (US3, SC-005).
- **Given** an `observable-plot` panel's query is in flight, **when** it first
  mounts, **then** it shows the same inline `animate-pulse` skeleton
  convention `PlotlyPanel`/`ValueBoxPanel` already use, not a new shared
  loading component (US3, research.md §7).
- **Given** a `select`/`multiselect` input currently set to a non-default
  value, **when** its options are (re-)fetched, **then** the fetched option
  list still contains every selectable value the column actually has — not
  narrowed down to only the currently-selected value — proving the options
  query is genuinely unfiltered by the panel's own `filter:` bindings,
  including the input's own (research.md §9).
- **Given** an input's configured `default` does not match any value
  actually present in its bound column, **when** the panel first queries,
  **then** a `select`/`multiselect` input's query legitimately returns zero
  rows and `PanelEmptyState` appears (not a thrown error or a silently
  substituted value), while a `range` input's `default` is clamped to
  `[min, max]` by the browser before any query is built — two different,
  both non-crashing outcomes, not treated as the same case (research.md §9,
  spec.md's Edge Cases).
- **Given** a panel with a `select` input whose current value is not present
  in its fetched options list, **when** the control renders, **then** it
  still visibly shows the actual current value (a synthesized `<option>`),
  not a different option the browser happens to pick as a fallback
  (research.md §9).
- **Given** a rendered `observable-plot` panel, **when** its render-and-swap
  effect runs (mount, or any `[config, rows, status]` change), **then**
  exactly one `Plot.plot()` rebuild-and-swap occurs for that state — the
  render-and-swap effect's synchronous `render()` call and the
  `ResizeObserver`'s spec-guaranteed initial callback do **not** each
  independently rebuild the chart for the same unchanged size (research.md
  §5b) — verifiable via a rebuild-count assertion (e.g. counting
  `container.children`/appended-element identity changes over a short
  window after mount), not just visual inspection.

## Non-goals for this feature

- No global sidebar filter-bar UI (rendering the top-level `filters:` block
  as interactive controls) — only this panel type's own `inputs:` controls
  are built (spec.md's Assumptions; research.md §8).
- No new panel type beyond `observable-plot` itself — `sankey`/`flowmap`/
  `zonemap`/`graphic-walker` remain deferred, unchanged from prior
  panel-type features' stated boundaries.
- No `all_option`/"select all" semantics for panel-local `inputs:` —
  `docs/GRAMMAR.md`'s documented `inputs:` shape has no such field
  (data-model.md's `ObservablePlotInputConfig`); the `$inputs.` line-drop
  extension in `sqlExpander.ts` exists for consistency with `$filters.`'s
  existing treatment, not because any current grammar/fixture exercises it.
- No range-type input's specific control widget beyond a functioning HTML
  range control — no custom styling/snapping/tick-mark behavior beyond what
  this feature's own fixtures exercise.
