import { useEffect, useState, type ReactNode } from 'react'
import { GraphicWalker } from '@kanaries/graphic-walker'
import '@kanaries/graphic-walker/dist/style.css'
import '@/panels/graphicWalkerPanel.css'
import { Compass } from 'lucide-react'

import { listViews, query, queryArrow } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useColorScheme } from '@/hooks/useColorScheme'
import { buildGraphicWalkerQuery, EMPTY_SUMMARIZE_CONFIG } from '@/panels/panelQuery'
import { inferFields, type InferredField } from '@/panels/graphicWalkerFields'
import { listSelectableDatasets, filterSchemaConsistent } from '@/panels/graphicWalkerDatasets'
import { DatasetPicker } from '@/panels/graphicWalkerDatasetPicker'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { GraphicWalkerPanelConfig } from '@/layout/types'

// This panel's own query never emits a $filters./$inputs. placeholder
// (FR-005 — no global-filter reactivity, this project's "snapshot model"
// for graphic-walker, docs/GRAMMAR.md/docs/ARCHITECTURE.md), so
// sqlExpander.expand()'s FilterStateLike argument is never actually
// consulted for this caller. A trivial stub, not a real store — same
// duck-typed contract every other expand() caller already relies on
// (services/sqlExpander.ts).
const NOOP_FILTER_STATE = { get: () => undefined }

// Real, confirmed bug found live on the Explore tab (a genuine, reported
// GraphicWalker crash, "Computation service" error) — the SAME root cause
// already found and fixed once for ZoneMapPanel.tsx's own choropleth-value
// join (031-all-panel-demo-content): Arrow's own `queryArrow()` returns any
// 64-bit integer column (DuckDB's real, confirmed on-disk BIGINT type for
// `trip_mode_share.trips` — a COUNT(*)-derived aggregate — and, more
// severely, for EVERY numeric column in `person_household_profile`, 10 of
// its 14 real columns) as a genuine JS `bigint` primitive, never `number`.
// `table.toJSON()` does NOT convert this — confirmed directly against the
// real Parquet schema via `DESCRIBE SELECT * FROM read_parquet(...)`, not
// assumed. GraphicWalker's own internal computation engine does ordinary
// arithmetic/comparison across whatever numeric-looking columns it's
// handed (sorting, binning, aggregating for its own chart rendering) —
// JavaScript throws a real `TypeError` the instant a `bigint` is mixed
// with a `number` in most operators, which is exactly what "Computation
// service" errors out on. Same fix technique as ZoneMapPanel.tsx's own
// `typeof raw === 'number' || typeof raw === 'bigint' ? Number(raw) :
// null` — reused here, not reinvented, applied across every column of
// every row (this panel hands GraphicWalker the WHOLE row, unlike
// ZoneMapPanel's single known value field) since real trip/person/
// household counts never approach Number.MAX_SAFE_INTEGER.
//
// This is a generic, cross-cutting DuckDB-WASM/Arrow behavior — not
// specific to this panel type (ZoneMapPanel.tsx already hit the identical
// root cause independently). Worth a shared conversion in the query layer
// itself (services/duckdb.ts's queryArrow(), or a small shared helper) if
// a third panel type ever hits this same class of bug — not done here,
// since fixing this real, reported crash is the immediate priority and a
// third occurrence hasn't actually happened yet.
function convertBigIntsToNumbers(row: Record<string, unknown>): Record<string, unknown> {
  const converted: Record<string, unknown> = {}
  for (const key in row) {
    const value = row[key]
    converted[key] = typeof value === 'bigint' ? Number(value) : value
  }
  return converted
}

// The ninth and last originally-listed panel type — see
// contracts/graphic-walker-panel.md and specs/014-graphic-walker-panel/
// research.md. Structurally closer to MarkdownPanel.tsx's "no reactive
// query loop" shape than to TablePanel.tsx's filter-reactive one — no
// useFilterState call anywhere in this component — but DOES still query
// services/duckdb.ts once, unlike MarkdownPanel.
//
// Renders the real <GraphicWalker> React component directly (as JSX, in
// THIS component's own tree) — NOT embedGraphicWalker(), a reversal of
// research.md §3's original decision, found and corrected post-
// completion: embedGraphicWalker()'s own real source
// (node_modules/@kanaries/graphic-walker/dist/vanilla.js, read directly,
// not assumed from its `: any`-typed .d.ts signature) calls
// ReactDOM.createRoot(dom) internally and keeps that root in a fully
// local variable — never returned, never exposed anywhere, so a caller
// has no way to call .unmount() on it even if it wanted to. That inner
// root is a SECOND, independent React instance our own app's React has
// no awareness of; the compiled bundle registers 38 real
// document/window.addEventListener calls (confirmed via direct grep of
// graphic-walker.es.js, most following the standard React
// useEffect-cleanup-on-unmount idiom) plus a MobX VizSpecStore
// (makeAutoObservable) — none of that gets torn down when our own outer
// container is merely removed from the DOM, since removing a DOM node
// does not, by itself, trigger a *different* React root's own unmount
// lifecycle. This app's own shell.tsx mounts only the ACTIVE tab's
// DashboardRenderer (confirmed by reading it), so this is a real,
// accumulating leak on every tab switch, not a theoretical one. Fixed by
// rendering the plain <GraphicWalker> component as ordinary JSX instead
// — embedGraphicWalker's own source shows this is exactly what it does
// internally once data/fields are provided (no extra wrapping), so
// there is no behavioral difference beyond disposal now being handled
// correctly by our own, single, unified React tree's normal unmount
// reconciliation — no manual cleanup call needed at all.
export function GraphicWalkerPanel({ config }: { config: GraphicWalkerPanelConfig }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [fields, setFields] = useState<InferredField[]>([])
  // Read-only — follows whichever light/dark theme is currently resolved
  // (011-basemap-style-system's own Tailwind `.dark`-class-observing
  // hook), not 'media': useColorScheme() already resolves this app's OWN
  // effective theme (system preference today, a future real toggle
  // later with zero change needed here), so handing GraphicWalker the
  // ALREADY-resolved value keeps it in lockstep with the rest of the
  // app rather than letting it independently re-derive
  // prefers-color-scheme itself, which could diverge from an explicit
  // in-app override once one exists.
  const colorScheme = useColorScheme()
  // Only consulted when config.scenario is unset — buildGraphicWalkerQuery's
  // own branching means a pinned config.scenario produces a
  // scenario-set-independent SQL string regardless of what this value is,
  // so a scenario activated elsewhere never forces a surprise re-query/
  // reset of a viewer's in-progress chart for a panel pinned to one
  // scenario (data-model.md's "Component state" section).
  const activeScenarioNames = useActiveScenarios()

  // 028-graphic-walker-dataset-picker — the viewer's own current selection,
  // initialized from config.dataset (which stays REQUIRED regardless of
  // dataset_picker — research.md §6) and never touched again except by the
  // viewer picking a different entry from the DatasetPicker below.
  const [selectedDataset, setSelectedDataset] = useState(config.dataset)

  // The datasets a viewer may pick, when dataset_picker is enabled: every
  // metric queryable across ALL of `scenarioScope` (a single pinned
  // scenario, or every currently active scenario — research.md §5),
  // recomputed whenever the active scenario set changes. This is not new
  // reactivity — activeScenarioNames is already a dependency of the query
  // effect below; this mirrors that same existing signal for the
  // AVAILABLE-options list, not just the currently displayed data
  // (research.md §4). Deliberately NOT dependent on global filters — no
  // useFilterState call anywhere in this component (FR-009/014's FR-005).
  //
  // Async (not a useMemo) because of a real, confirmed gap found during
  // this feature's own implementation: listSelectableDatasets()'s
  // view-EXISTENCE check alone can't tell that a metric's real columns
  // differ between two scenarios (a real, reachable case in this
  // project's own fixture data — vmt_by_home_taz has 2 columns under
  // observed, 3 under good_scenario), which would make
  // sqlExpander.ts's own unmodified $scenario. UNION ALL throw the
  // moment a viewer actually picked it — exactly the predictable failure
  // FR-005/SC-002 exist to prevent. filterSchemaConsistent() closes that
  // gap, but needs each scenario's real column names, fetched via one
  // `information_schema.columns` query per scenario in scope (skipped
  // entirely when scenarioScope has 0-1 entries — no UNION is ever built
  // for a single/pinned scenario, so there's nothing to mismatch).
  const [availableDatasets, setAvailableDatasets] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    if (!config.dataset_picker) {
      setAvailableDatasets([])
      return undefined
    }
    const scenarioScope = config.scenario ? [config.scenario] : activeScenarioNames
    const candidates = listSelectableDatasets(listViews(), scenarioScope)
    if (scenarioScope.length <= 1 || candidates.length === 0) {
      setAvailableDatasets(candidates)
      return undefined
    }
    Promise.all(
      scenarioScope.map(async (scenarioName) => {
        const prefix = `${scenarioName}__`
        const viewNames = candidates.map((metric) => `${prefix}${metric}`)
        const rows = await query(
          `SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position) AS cols ` +
            `FROM information_schema.columns ` +
            `WHERE table_name IN (${viewNames.map((v) => `'${v}'`).join(', ')}) ` +
            `GROUP BY table_name`,
        )
        const columnsForScenario = new Map<string, string>()
        for (const row of rows) {
          const tableName = row.table_name as string
          columnsForScenario.set(tableName.slice(prefix.length), row.cols as string)
        }
        return [scenarioName, columnsForScenario] as const
      }),
    ).then((entries) => {
      if (cancelled) return
      setAvailableDatasets(filterSchemaConsistent(candidates, scenarioScope, new Map(entries)))
    })
    return () => {
      cancelled = true
    }
  }, [config.dataset_picker, config.scenario, activeScenarioNames])

  // Data fetch — runs once per (selected dataset, scenario, limit) triple.
  // Never reacts to a global sidebar filter at all (FR-005 — no
  // useFilterState call anywhere in this component). The SQL is built from
  // an EFFECTIVE config whose `dataset` is the viewer's current selection
  // — always equal to config.dataset when dataset_picker is off/absent,
  // since selectedDataset is never reassigned in that case.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const effectiveConfig = { ...config, dataset: selectedDataset }
    const template = buildGraphicWalkerQuery(effectiveConfig)
    const sql = sqlExpander.expand(
      template,
      EMPTY_SUMMARIZE_CONFIG,
      NOOP_FILTER_STATE,
      activeScenarioNames,
    )
    queryArrow(sql)
      .then((table) => {
        if (cancelled) return
        const nextRows = table.toArray().map((r) => convertBigIntsToNumbers(r.toJSON()))
        if (nextRows.length === 0) {
          setStatus('empty')
          return
        }
        // fields computed from the SAME queryArrow() result that produced
        // rows — never a second query (research.md §5). A fresh `fields`
        // array is exactly what makes switching datasets discard the
        // viewer's prior chart binding (FR-008/SC-005) — <GraphicWalker>
        // receives entirely new data/fields props, with no explicit
        // "reset" call needed.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDataset, config.scenario, config.limit, config, activeScenarioNames])

  // 028-graphic-walker-dataset-picker — the picker is now part of every
  // status branch below, not just 'ready': a viewer whose CURRENT
  // selection fails (e.g. its scenario was deactivated — FR-012, or the
  // "No Match" fixture case) can still pick a different, working dataset
  // from the same control, rather than being stuck looking at an error
  // with no way to recover short of an author edit. Shown only when the
  // author opted this panel into it (FR-001/FR-002) — every panel that
  // doesn't is visually and behaviorally identical to before this
  // feature existed.
  const picker = config.dataset_picker ? (
    <DatasetPicker current={selectedDataset} options={availableDatasets} onSelect={setSelectedDataset} />
  ) : null

  let content: ReactNode
  if (status === 'error') {
    content = <PanelErrorState message={`Failed to load "${selectedDataset}"`} />
  } else if (status === 'empty') {
    content = <PanelEmptyState icon={Compass} message="No data available to explore" />
  } else if (status === 'loading') {
    // wftdm-design-system skill's Skeleton composition recipe (Phase 3
    // Batch 3) — a real, confirmed gap found auditing this panel, not
    // merely "needs upgrading" like the other panel types: this was the
    // ONE loading state with LESS than the pre-Phase-3 baseline every
    // other panel type already had — a bare, entirely unstyled div, no
    // animate-pulse/bg-muted at all. GraphicWalker's own real, stable
    // top-level shape (a field-list sidebar beside a main chart canvas) is
    // genuinely structural, not data-dependent, so a shaped two-pane
    // skeleton is a safe, low-risk choice here, unlike guessing at
    // chart-specific content this library's own internal rendering
    // decides.
    //
    // A real bug caught during this fix's own screenshot verification,
    // not shipped: an earlier draft dropped the explicit height entirely,
    // reasoning that `.graphic-walker-panel-content > div { height: 100% }`
    // (graphicWalkerPanel.css) would size it the same way it sizes the
    // real ready-state <GraphicWalker> div. That's true only when
    // config.height (or the dialog's own flex sizing) gives the ancestor
    // chain a DEFINITE height — for a panel configured with no height: at
    // all (this app's own most common case, confirmed via a real fixture:
    // "Free-form Visual Analytics (Summary Tab)" sets no height field),
    // the whole chain resolves to indeterminate/auto, and the READY
    // state's own real GraphicWalker content still shows up correctly
    // because it has genuine INTRINSIC size of its own (real toolbar/
    // field-list/canvas chrome) — but this skeleton's two empty,
    // content-less `h-full` divs have nothing to size against and
    // silently collapsed to 0px height, confirmed live via a real
    // screenshot showing an entirely blank card. Fixed by keeping the
    // SAME `config.height ?? 700` fallback the original bare div already
    // had (the one part of it that was actually correct) and adding real
    // visual content inside it, rather than removing the height
    // altogether.
    content = (
      <div className="flex gap-3" style={{ height: config.height ?? 700 }} aria-hidden="true">
        <div className="h-full w-48 shrink-0 animate-pulse rounded-md bg-muted" />
        <div className="h-full flex-1 animate-pulse rounded-md bg-muted" />
      </div>
    )
  } else {
    content = <GraphicWalker data={rows} fields={fields} themeKey="g2" appearance={colorScheme} />
  }

  // themeKey="g2" matches embedGraphicWalker()'s own hardcoded default
  // (vanilla.js: `{ themeKey: "g2", ...props }`) — kept here for visual
  // parity with what was already built/verified against, not a fresh
  // choice. themeKey (IThemeKey: 'vega' | 'g2' | 'streamlit') controls
  // the CHART's own color palette family — a completely separate axis
  // from light/dark UI chrome, confirmed directly against the installed
  // package's own interfaces.d.ts before writing this. Light/dark is
  // `appearance` (IThemeProps.appearance: 'media' | 'light' | 'dark') —
  // NOT `dark`, that prop's own real .d.ts marks it `@deprecated renamed
  // to appearence` [sic] on the very next line above `appearance` itself.
  //
  // height: '100%' (not `config.height ?? 700`) — a real bug fix, the
  // same class of hardcoded-pixel-height bug already found and fixed once
  // for ZoneMapPanel.tsx: this div's real ancestor (panelExpandHost.tsx's
  // inlineAnchor in the card view, dialogAnchor in the 004 expand-dialog
  // view) already supplies the correct height for whichever context this
  // panel is currently rendered in — trusting it, rather than reasserting
  // an independent, disconnected pixel number here, is what lets this
  // panel actually fill a much taller expand-dialog instead of clipping
  // at a stale 700px. See graphicWalkerPanel.css for the second, distinct
  // half of this fix: <GraphicWalker>'s own shadow-DOM host div (this
  // component has no prop to size it directly) needed a CSS child-
  // selector override to actually respect that height in turn.
  return (
    <div className="graphic-walker-panel-host" style={{ height: '100%' }}>
      {picker}
      {/* graphicWalkerPanel.css's own height-forcing child-selector fix
          (below) is scoped to THIS wrapper specifically — not to
          .graphic-walker-panel-host's every direct child — so `picker`
          above keeps its own natural height instead of being stretched to
          fill the panel too (a real bug caught during this feature's own
          implementation: .graphic-walker-panel-host > div originally
          matched ANY direct child div, picker's included). */}
      <div className="graphic-walker-panel-content">{content}</div>
    </div>
  )
}
