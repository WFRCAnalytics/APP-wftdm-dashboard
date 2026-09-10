# Contract: `PlotlyPanel` (`src/panels/PlotlyPanel.tsx`)

Satisfies: FR-006, FR-007, FR-011. Proves the full pipeline (spec.md User
Story 3) using `project-docs/SPEC.md`'s corrected two-effect pattern — one effect
for data fetch + `Plotly.react()` (no purge), a separate empty-deps effect
for `Plotly.purge()` on actual unmount only.

## Shape

```tsx
export function PlotlyPanel({ config }: PanelProps<PlotlyPanelConfig>) {
  const filters = useFilterState(/* derived from config.filter, or ALL_FILTERS */)
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  // Data fetch + Plotly.react() — re-runs on config/filters change.
  // Never purges here; react() diffs against the existing plot.
  useEffect(() => {
    let cancelled = false
    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(config, appState.getActive().map((s) => s.name))
    // Intentionally empty, not a stub — panel queries only ever use
    // $scenario/$filters, never $mappings/$bins/$sql (research.md §2).
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)
    query(sql)
      .then((rows) => {
        if (cancelled || !containerRef.current) return
        if (rows.length === 0) { setStatus('empty'); return }
        const traces = config.traces.flatMap((trace) => resolveTraces(trace, rows))
        Plotly.react(containerRef.current, traces, config.layout ?? {})
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [config, filters])

  // Unmount-only teardown — a second effect, empty deps.
  useEffect(() => {
    return () => { if (containerRef.current) Plotly.purge(containerRef.current) }
  }, [])

  if (status === 'empty') return <PanelEmptyState icon={ChartNoAxesColumn} message="No data for this selection" />
  if (status === 'error') return <PanelErrorState message="Couldn't load this chart" />
  return (
    <>
      {status === 'loading' && <div className="h-full animate-pulse rounded-md bg-muted" style={{ height: config.height ?? 350 }} />}
      <div ref={containerRef} style={{ height: config.height ?? 350, display: status === 'loading' ? 'none' : undefined }} />
    </>
  )
}
```

`resolveTraces` (`src/panels/plotlyTraces.ts` — deliberately split out of
this file: `plotly.js-dist-min` references `self`, a browser global, at
module-load time, which throws in the Vitest Node environment even to
reach a pure helper defined alongside it; the split keeps this logic
Vitest-testable by depending on Plotly's types only, never its runtime
module) implements research.md §3's `$metric.col`/`$scenario` resolution
— reads a `PlotlyTraceConfig`'s `x`/`y`/`color`/`name`/`text` values and,
for any matching `$metric.<column>` or bare `$scenario`, maps it to
`rows.map(r => r[column])` (or `r.scenario` for the bare `$scenario`
case). This is `project-docs/SPEC.md`'s own dashboard-config example
(`x: $metric.observed`, `name: $scenario`) implemented exactly as written
there — `PlotlyTraceConfig`'s `x`/`y`/`color`/`name`/`text` fields are NOT
meant to hold literal column names directly; a config author writes
`$metric.<column>` (or the bare `$scenario` sentinel) exactly as
`project-docs/GRAMMAR.md`'s `type: plotly` example shows, and `resolveTraces` is
where that syntax actually gets resolved against the query result — no
deviation from the documented grammar.

**One trace config can produce multiple real Plotly traces.** A `color`
key, or a `name` key that resolves to a column (most commonly the bare
`$scenario` sentinel — comparing scenarios is the actual use case the
whole `$scenario.<metric>` union mechanism exists for), splits into one
real trace per distinct value of that column — `color` wins when both
resolve to a column. A placeholder-resolved `name` is inherently one value
per row; it can never be a valid scalar legend label without this split,
so `name: $scenario` alone (no `color` set) triggers exactly the same
splitting `color` does, not a scalar array assignment. Each split trace
gets its own `name` (the distinct value), its own `text` (sliced to that
category's rows, same as `x`/`y`), and no explicit `marker.color` —
Plotly's own default palette assigns each trace a distinct color; a
category string was never a valid CSS color value to begin with. The full
`buildPanelQuery` →
`resolveActiveScenarios` → `sqlExpander.expand()` → `query()` chain is
`contracts/panel-query.md`'s "Composing with sqlExpander.expand()" section,
reused verbatim here. `PanelEmptyState`/`PanelErrorState` are the same
shared, Scoresheet-ported components `ValueBoxPanel` uses (research.md §8,
`contracts/panel-registry.md`) — not bespoke to this panel type. The
loading placeholder (`animate-pulse` on a `bg-muted` block sized to
`config.height`) has no Scoresheet precedent to port (research.md §8 found
none) and is kept in the DOM-but-hidden `containerRef` div throughout so
`Plotly.react()` always has a mounted node to target once data arrives.

## Given/When/Then

- **Given** a `PlotlyPanelConfig` with one trace (`x: $metric.purpose`,
  `y: $metric.share`, no `color`, a literal `name`), **when** the panel
  mounts, **then** `resolveTraces` resolves `$metric.purpose`/
  `$metric.share` to `rows.map(r => r.purpose)`/`rows.map(r => r.share)`
  from the query result and returns exactly one trace, and the rendered
  chart's data matches those columns (US3.1) — `$metric.<column>` syntax
  is resolved here, in `plotlyTraces.ts`, not bypassed in favor of literal
  column names.
- **Given** two or more active scenarios and a trace with `name:
  $scenario` (the bare sentinel, per `project-docs/GRAMMAR.md`'s own `type:
  plotly` example — "auto-replaced per loaded scenario") and no `color`
  set, **when** `resolveTraces` runs, **then** it returns one trace per
  distinct scenario value present in the rows, each with its own `name`
  equal to that scenario's name (a plain string, never an array) and its
  `x`/`y` sliced to only that scenario's rows — comparing scenarios on one
  chart is the actual use case the `$scenario.<metric>` union mechanism
  exists for, and it must produce a correctly separated, correctly
  legended trace per scenario, not one trace with a garbled per-row array
  assigned to a scalar field.
- **Given** a trace with both `color` and a placeholder-resolving `name`
  set, **when** `resolveTraces` runs, **then** `color`'s column drives the
  split, not `name`'s — the more specific request wins.
- **Given** the chart is already rendered, **when** a filter the panel's
  query depends on changes, **then** `Plotly.react()` is called again with
  new data on the *same* container — the chart updates in place, it is
  not torn down and recreated (US3.2, FR-006's "redrawing in place").
- **Given** the tab containing this panel is switched away from and back,
  **when** the panel remounts, **then** exactly one `Plotly.react()` call
  initializes the new container and no reference to the previous mount's
  container survives (US3.3) — guaranteed by the unmount effect's
  `Plotly.purge()` running on the *old* container before the new mount's
  effects run.
- **Given** the panel unmounts while its query is in flight, **when** that
  query later resolves, **then** `Plotly.react()` is NOT called against a
  detached container — the `cancelled` flag guards it (FR-011), same
  pattern as `ValueBoxPanel`.
- **Given** the panel's query returns zero rows, **when** it renders,
  **then** it shows the shared `PanelEmptyState`, never an empty Plotly
  chart frame or a blank area.
- **Given** the panel's query rejects, **when** it renders, **then** it
  shows the shared `PanelErrorState` — caught by the component's own
  `.catch()`, not relying solely on `panelCard.tsx`'s error boundary
  (which only catches synchronous render-time throws, not rejected
  promises).

## Non-goals for this feature

- No `reference_lines` or `observed` overlay rendering — parsed
  (`data-model.md`) but not required to visually render for FR-006 to be
  satisfied; a future enhancement to this same component.
- No panel-local filter inputs (`$inputs.x`) — out of scope; that
  placeholder kind belongs to the `plot` (Observable Plot) panel type,
  which this feature does not implement (research.md §2).
