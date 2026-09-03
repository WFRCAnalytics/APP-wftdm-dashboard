import { useEffect, useState } from 'react'
import { GraphicWalker } from '@kanaries/graphic-walker'
import '@kanaries/graphic-walker/dist/style.css'
import { Compass } from 'lucide-react'

import { queryArrow } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useColorScheme } from '@/hooks/useColorScheme'
import { buildGraphicWalkerQuery, EMPTY_SUMMARIZE_CONFIG } from '@/panels/panelQuery'
import { inferFields, type InferredField } from '@/panels/graphicWalkerFields'
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

  // Data fetch — runs once per (dataset, scenario, limit) triple. Never
  // reacts to a global sidebar filter at all (FR-005 — no useFilterState
  // call anywhere in this component).
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const template = buildGraphicWalkerQuery(config)
    const sql = sqlExpander.expand(
      template,
      EMPTY_SUMMARIZE_CONFIG,
      NOOP_FILTER_STATE,
      activeScenarioNames,
    )
    queryArrow(sql)
      .then((table) => {
        if (cancelled) return
        const nextRows = table.toArray().map((r) => r.toJSON())
        if (nextRows.length === 0) {
          setStatus('empty')
          return
        }
        // fields computed from the SAME queryArrow() result that produced
        // rows — never a second query (research.md §5).
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
  }, [config.dataset, config.scenario, config.limit, config, activeScenarioNames])

  if (status === 'error') {
    return <PanelErrorState message={`Failed to load "${config.dataset}"`} />
  }
  if (status === 'empty') {
    return <PanelEmptyState icon={Compass} message="No data available to explore" />
  }
  if (status === 'loading') {
    // No separate shared "loading" component — loading states are
    // deliberately inline per panel type (constitution v2.2.0 Development
    // Workflow), no reusable component exists to reuse here either.
    return <div style={{ height: config.height ?? 700 }} />
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
  return (
    <div style={{ height: config.height ?? 700 }}>
      <GraphicWalker data={rows} fields={fields} themeKey="g2" appearance={colorScheme} />
    </div>
  )
}
