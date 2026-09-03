# Contract: `GraphicWalkerPanel` (`src/panels/GraphicWalkerPanel.tsx`)

Satisfies: FR-001 through FR-011. The ninth and last originally-listed
panel type — proves config → one-time-query → hand off to a
viewer-driven, third-party exploration UI, structurally closer to
`contracts/markdown-panel.md`'s "no reactive query loop" shape than to
`contracts/table-panel.md`'s filter-reactive one, but *does* still query
`services/duckdb.ts` once (unlike markdown).

## Shape

**Renders `<GraphicWalker>` as ordinary JSX, NOT `embedGraphicWalker`.**
The original draft of this contract used `embedGraphicWalker` (matching
`CLAUDE.md`'s/`docs/ARCHITECTURE.md`'s own pre-existing sketch); reversed
post-completion, a real bug found by reading `embedGraphicWalker`'s own
installed source directly
(`node_modules/@kanaries/graphic-walker/dist/vanilla.js`): it calls
`ReactDOM.createRoot(dom)` internally and keeps that root in a fully
local variable, never returned or exposed — no caller can ever dispose
of it. The compiled bundle registers 38 real `document`/
`window.addEventListener` calls (mostly the standard React
`useEffect`-cleanup idiom) plus a MobX `VizSpecStore` — none of it gets
torn down when our own container is merely removed from the DOM, since
that doesn't trigger a *different, independent* React root's own unmount
lifecycle. This app's `shell.tsx` mounts only the active tab's
`DashboardRenderer`, so every tab switch is a real mount/unmount cycle —
a real, accumulating leak, not theoretical (research.md §3 has the full
finding). Fixed by rendering the plain `<GraphicWalker>` component
directly — `embedGraphicWalker`'s own source proves this is exactly
equivalent in output once `data`/`fields` are provided (no extra
wrapping) — so our own single React tree's normal unmount reconciliation
now disposes everything correctly, with no manual cleanup call needed.

```tsx
import { useEffect, useState } from 'react'
import { GraphicWalker } from '@kanaries/graphic-walker'
import { Compass } from 'lucide-react'

import { queryArrow } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { buildGraphicWalkerQuery, EMPTY_SUMMARIZE_CONFIG } from '@/panels/panelQuery'
import { inferFields, type InferredField } from '@/panels/graphicWalkerFields'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { GraphicWalkerPanelConfig } from '@/layout/types'

// This panel's own query never emits a $filters./$inputs. placeholder
// (FR-005 — no global-filter reactivity), so sqlExpander.expand()'s
// FilterStateLike argument is never actually consulted for this caller.
// A trivial stub, not a real store — same duck-typed contract every
// other expand() caller already relies on (services/sqlExpander.ts).
const NOOP_FILTER_STATE = { get: () => undefined }

export function GraphicWalkerPanel({ config }: { config: GraphicWalkerPanelConfig }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [fields, setFields] = useState<InferredField[]>([])
  // Only consulted when config.scenario is unset (data-model.md) — a
  // pinned scenario is a fixed, one-time target, not reactive to what
  // else loads afterward.
  const activeScenarioNames = useActiveScenarios()

  // Data fetch — runs once per (dataset, scenario, limit) triple, NOT on
  // every activeScenarioNames change when config.scenario is pinned
  // (data-model.md's own "Component state" section explains why).
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const template = buildGraphicWalkerQuery(config)
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, NOOP_FILTER_STATE, activeScenarioNames)
    queryArrow(sql)
      .then((table) => {
        if (cancelled) return
        const nextRows = table.toArray().map((r) => r.toJSON())
        if (nextRows.length === 0) {
          setStatus('empty')
          return
        }
        setRows(nextRows)
        setFields(inferFields(table.schema.fields, config.fields))
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [config.dataset, config.scenario, config.limit, config, activeScenarioNames])

  if (status === 'error') {
    return <PanelErrorState message={`Failed to load "${config.dataset}"`} />
  }
  if (status === 'empty') {
    return <PanelEmptyState icon={Compass} message="No data available to explore" />
  }
  if (status === 'loading') {
    return <div style={{ height: config.height ?? 700 }} />
  }

  // themeKey="g2" matches embedGraphicWalker()'s own hardcoded default —
  // kept for visual parity with what was already built/verified.
  return (
    <div style={{ height: config.height ?? 700 }}>
      <GraphicWalker data={rows} fields={fields} themeKey="g2" />
    </div>
  )
}
```

(Illustrative — the load-bearing contract is: the query effect's
dependency array keys on the *content* of the dataset binding
(`dataset`/`scenario`/`limit`), not on `useFilterState`'s output at all —
no such hook is called anywhere in this component; `rows`/`fields` state
is only replaced once per successful, non-empty query resolution — a
`dataset:`/`scenario:` config change while the panel is already mounted
re-renders `<GraphicWalker>` with fresh props, React's own normal
reconciliation handling the transition (no manual "clear the container
first" step is needed the way an imperative DOM-mount API required);
`inferFields()` runs against the *same* `queryArrow()` result that
produced `rows`, never a second query; a `config.scenario`-pinned
panel's effect still lists `activeScenarioNames` in its dependency array
for hook-correctness, but `buildGraphicWalkerQuery()`'s own branching
means the *SQL it produces* is scenario-set-independent whenever
`config.scenario` is set, so `sqlExpander.expand()`'s
`activeScenarioNames` argument value never actually changes that
branch's resulting query string — no functional re-query happens from an
unrelated scenario activation in that case, even though the effect
itself re-runs; and — the one genuinely new guarantee this shape adds
over the original `embedGraphicWalker` draft — unmounting
`GraphicWalkerPanel` (a tab switch; `shell.tsx` mounts only the active
tab's `DashboardRenderer`) now correctly disposes `<GraphicWalker>`'s own
internal state via React's ordinary unmount reconciliation, with no
leaked global listeners or MobX reactions.)

`config.title`/`config.width`/`config.height` flow through
`panelCard.tsx` exactly like every other panel type — nothing
graphic-walker-specific there (research.md §7, confirmed directly, not
just assumed). `004`'s `usePanelExpandHost` wraps this component exactly
like every other registry entry — same mounted instance, inline vs.
dialog is a visual relocation only, same as every prior panel type
(FR-008).

## `inferFields` (`src/panels/graphicWalkerFields.ts`)

```ts
import { DataType, type Field } from 'apache-arrow'
import type { GraphicWalkerFieldOverride } from '@/layout/types'

// Mirrors @kanaries/graphic-walker's own real IMutField shape (confirmed
// against the installed package's dist/interfaces.d.ts) — not imported
// from the library directly, matching how this project's other pure
// modules (e.g. sankeyColor.ts) shape their own return types locally.
// Structurally satisfies the library's own IMutField (required fields
// match, IMutField's extra fields are all optional there) when passed to
// <GraphicWalker>'s fields prop.
export interface InferredField {
  fid: string
  name: string
  semanticType: 'quantitative' | 'nominal' | 'ordinal' | 'temporal'
  analyticType: 'dimension' | 'measure'
}

export function inferFields(
  schemaFields: Field[],
  overrides: GraphicWalkerFieldOverride[] = [],
): InferredField[] {
  const overrideByFid = new Map(overrides.map((o) => [o.fid, o]))
  return schemaFields.map((f) => {
    const override = overrideByFid.get(f.name)
    if (override) {
      return { fid: override.fid, name: override.name ?? f.name, semanticType: override.semanticType, analyticType: override.analyticType }
    }
    return { fid: f.name, name: f.name, ...inferTypesFromArrow(f.type) }
  })
}

// research.md §5's mapping table, applied to one Arrow DataType.
function inferTypesFromArrow(type: unknown): Pick<InferredField, 'semanticType' | 'analyticType'> {
  if (DataType.isInt(type) || DataType.isFloat(type)) return { semanticType: 'quantitative', analyticType: 'measure' }
  if (DataType.isDate(type) || DataType.isTimestamp(type)) return { semanticType: 'temporal', analyticType: 'dimension' }
  // isUtf8/isDictionary/isBool, and any other type not explicitly
  // handled above, all fall through to this fail-soft default —
  // research.md §5's table intentionally has no separate isBool branch,
  // since nominal/dimension is already its correct mapping too.
  return { semanticType: 'nominal', analyticType: 'dimension' }
}
```

## Given/When/Then

- **Given** a `graphic-walker` panel bound to a dataset with real rows,
  **when** the panel mounts, **then** `<GraphicWalker>` renders a
  free-form field list/chart-type picker/encoding-shelf UI populated from
  that dataset's own columns, with no chart pre-selected (US1, FR-002).
- **Given** the panel described above, **when** the viewer drags a field
  onto a shelf and picks a mark type, **then** a chart renders from the
  already-fetched snapshot with no additional `services/duckdb.ts` call
  (US1, FR-002/FR-005) — confirmed via `services/duckdb.ts`'s existing
  `__debugQueryLog()` test instrumentation showing exactly one query for
  the whole interaction sequence.
- **Given** two `graphic-walker` panels configured with different
  `dataset:` values, **when** both are mounted on the same tab, **then**
  each shows only its own dataset's columns/rows, with no shared state
  (US2, FR-010).
- **Given** a panel with `scenario:` omitted and more than one scenario
  currently loaded, **when** the panel loads, **then** its field list
  includes a `scenario` field (`nominal`/`dimension`), and its row count
  equals the sum of each loaded scenario's own matching dataset row
  count (US2 Scenario 3, FR-004).
- **Given** a panel with `scenario: base_tbm` set, **when** the panel
  loads, **then** its rows come from only `"base_tbm__<dataset>"`, with
  no `scenario` column present at all (US2 Scenario 4, FR-004).
- **Given** a panel's `dataset:` does not resolve to a registered view,
  **when** the panel mounts, **then** `PanelErrorState` renders — same
  shared component every other panel type's own query failure already
  uses (FR-009).
- **Given** a panel's query resolves with zero rows, **when** the panel
  mounts, **then** `PanelEmptyState` renders (FR-009).
- **Given** a panel with an in-progress viewer-built chart, **when** the
  viewer triggers `004`'s expand control, **then** the same mounted
  `<GraphicWalker>` instance relocates into the dialog with the
  in-progress chart still showing, and collapsing it back preserves the
  same state again (US3, FR-008).
- **Given** a `graphic-walker` panel is mounted, **when** it unmounts (a
  tab switch — `shell.tsx` mounts only the active tab's
  `DashboardRenderer`), **then** its `<GraphicWalker>` subtree is
  disposed via React's own normal unmount reconciliation — no leaked
  `document`/`window` listeners or MobX reactions, unlike the original
  `embedGraphicWalker`-based draft (research.md §3).
- **Given** a column whose auto-inferred type is wrong for the author's
  intent (e.g. a numeric zone-id column), **when** that column's `fid` is
  listed in `config.fields`, **then** the panel uses the author-supplied
  `semanticType`/`analyticType` for that column instead of the inferred
  one, unchanged for every other column (FR-007).

## Non-goals for this feature

- No persistence of a viewer's chart configuration anywhere — not to
  `localStorage`/`sessionStorage` (constitution Principle VI forbids Web
  Storage outright regardless), not to any config file, not shared
  between viewers (FR-011).
- No reaction to `state/filterState.ts`'s global sidebar filters at all —
  this panel type calls no `useFilterState` hook (FR-005).
- No new DuckDB-WASM connection, worker, or extension — reuses the
  existing shared `AsyncDuckDB` instance's already-exported
  `queryArrow()` exactly as-is (constitution Principle II).
- No scaffolding of an actual `dashboard-7-explore.yaml` template or
  `public/dashboard-config/index.json` entry — out of scope, same
  stopping point every prior panel-type feature already used (spec.md's
  own Assumptions).
