# Contract: `ValueBoxPanel` (`src/panels/ValueBoxPanel.tsx`)

Satisfies: FR-005, FR-007, FR-011. The simplest panel type — proves
config → query → rendered scalar (spec.md User Story 2).

## Shape

```tsx
export function ValueBoxPanel({ config }: PanelProps<ValueBoxPanelConfig>) {
  const filters = useFilterState(/* derived from config.filter, or ALL_FILTERS */)
  const [value, setValue] = useState<unknown>(undefined)
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(config, appState.getActive().map((s) => s.name))
    // Intentionally empty, not a stub — panel queries only ever use
    // $scenario/$filters, never $mappings/$bins/$sql (research.md §2).
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)
    query(sql)
      .then((rows) => {
        if (cancelled) return
        if (rows.length === 0) { setState('empty'); return }
        setValue(rows[0][config.column])
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [config, filters])

  if (state === 'loading') return <ValueBoxSkeleton />
  if (state === 'empty') return (
    <PanelEmptyState icon={Ban} message="No data for this selection" />
  )
  if (state === 'error') return <PanelErrorState message="Couldn't load this value" />
  return <ValueBoxDisplay value={value} config={config} />
}
```

The full `buildPanelQuery` → `resolveActiveScenarios` → `sqlExpander.expand()`
→ `query()` chain is `contracts/panel-query.md`'s "Composing with
sqlExpander.expand()" section, reused verbatim here (and by `PlotlyPanel`)
— `buildPanelQuery`'s output alone is a template, not executable SQL.
`PanelEmptyState`/`PanelErrorState` are the shared components
`contracts/panel-registry.md` defines (ported from `APP-Project-
Scoresheet`, research.md §8) — not bespoke to this panel type.
`ValueBoxSkeleton` has no Scoresheet precedent to port (research.md §8
found none) — a simple `animate-pulse` placeholder (Tailwind's built-in
utility, no new token). Formatting (`config.format`, a Python-style format
string per `project-docs/GRAMMAR.md`), the optional `icon` (research.md §7), and
`observed`/`threshold_warn`/`threshold_fail` coloring are `ValueBoxDisplay`'s
concern — presentation detail, not part of this contract's Given/When/Then
(covered by implementation tasks, not re-derived here).

## Given/When/Then

- **Given** a `ValueBoxPanelConfig` querying a real metric/column,
  **when** the panel mounts, **then** the displayed value equals
  `rows[0][config.column]` from the query result (spec.md Acceptance
  Scenario US2.1, SC-002).
- **Given** the active scenario changes (a filter or `appState` change
  that affects which scenario views are queried), **when** the panel's
  effect re-runs, **then** the displayed value updates to the new
  scenario's data (US2.2).
- **Given** the query returns zero rows, **when** the panel renders,
  **then** it shows a distinct empty state — not a blank value, not `0`,
  not `undefined` rendered literally (US2.3).
- **Given** the panel unmounts (tab switch) while its query is still in
  flight, **when** that query later resolves, **then** `setValue`/
  `setState` are NOT called — the `cancelled` flag guards every state
  update after unmount (FR-011).

## Non-goals for this feature

- No multi-scenario side-by-side column display (`project-docs/GRAMMAR.md`'s
  "Multi-scenario: auto renders one column per loaded scenario" note) —
  this feature's fixture and stories exercise single-scenario display;
  multi-scenario comparison layout is a future enhancement to this same
  component, not required for FR-005 to be satisfied.
