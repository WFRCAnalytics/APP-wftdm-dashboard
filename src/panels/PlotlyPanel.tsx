import { useEffect, useRef, useState } from 'react'
import { ChartNoAxesColumn } from 'lucide-react'
import * as Plotly from 'plotly.js-dist-min'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useBaseline } from '@/hooks/useBaseline'
import { useColorScheme } from '@/hooks/useColorScheme'
import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import {
  buildComparisonDiffQuery,
  buildPanelQuery,
  isComparisonDiff,
  resolveActiveScenarios,
  resolveComparisonScenarioName,
  extractGlobalFilterIds,
  EMPTY_SUMMARIZE_CONFIG,
} from '@/panels/panelQuery'
import { resolveTraces } from '@/panels/plotlyTraces'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { PlotlyPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// 015-theme-toggle: real bug found live — Plotly.js's own default
// paper_bgcolor/plot_bgcolor is opaque white and font.color/gridcolor
// default to a fixed dark gray, none of it theme-aware, so every Plotly
// panel rendered a bright white card in dark mode. paper/plot background
// go fully transparent (letting the panel card's own bg-card/DialogContent's
// own bg-card show through underneath — no hex value to keep in sync with
// tokens.css at all), but text/gridlines/axis-lines need a REAL resolvable
// color (an SVG can't render "transparent" text) — resolved via
// getComputedStyle against the mounted container, the same pattern
// SankeyPanel.tsx's own resolveFallbackColors() already established for
// exactly this "need a token's current computed value in a canvas/SVG
// render path, not just a CSS class" problem. Hardcoded hex fallbacks
// match tokens.css's own current --foreground/--border values, used only
// if resolution somehow fails (e.g. no stylesheet loaded at all).
const FALLBACK_FOREGROUND = { light: '#151515', dark: '#ffffff' } as const
const FALLBACK_BORDER = { light: '#d8d5d2', dark: '#23394a' } as const

function resolveThemeLayout(el: HTMLElement, colorScheme: 'light' | 'dark'): Partial<Plotly.Layout> {
  const style = getComputedStyle(el)
  const foreground = style.getPropertyValue('--foreground').trim() || FALLBACK_FOREGROUND[colorScheme]
  const border = style.getPropertyValue('--border').trim() || FALLBACK_BORDER[colorScheme]
  return {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: foreground },
    xaxis: { gridcolor: border, linecolor: border, zerolinecolor: border },
    yaxis: { gridcolor: border, linecolor: border, zerolinecolor: border },
  }
}

// Proves the full pipeline (spec.md User Story 3): YAML config -> SQL
// expansion -> query -> Plotly.react() render, filter-reactive, using
// docs/SPEC.md's corrected two-effect pattern. See contracts/plotly-panel.md.
export function PlotlyPanel({ config }: { config: PlotlyPanelConfig }) {
  // extractGlobalFilterIds (panelQuery.ts) — see ValueBoxPanel.tsx's own
  // comment on why this replaced an inline config.filter.replace(...) call.
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  // 009-scenario-manager (FR-008): reactive active-scenario set — see
  // ValueBoxPanel.tsx's own comment on why this replaced a direct
  // appState.getActive() read inside the effect below.
  const activeScenarioNames = useActiveScenarios()
  // 019-baseline-diff-consumption: only consulted when config.comparison
  // references the '$baseline' sentinel — included in the fetch effect's
  // own dependency array below regardless, so a live baseline change
  // reactively re-triggers the fetch for a panel that uses it (FR-016).
  const baseline = useBaseline()
  const colorScheme = useColorScheme()
  // 035-scenario-label-color (FR-005/FR-012): reactive scenario
  // label/color map — see the dedicated re-render effect below, which
  // mirrors the theme-only effect's own "re-derive from cached data, no
  // new query" pattern exactly (a label/color change is never a reason
  // to hit DuckDB-WASM again).
  const scenarioDisplay = useScenarioDisplay()
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  // Remembers the last successfully-resolved traces/barmode so a theme-only
  // change (the effect below) can re-render with fresh colors WITHOUT
  // re-querying — a theme flip is not a reason to hit DuckDB-WASM again,
  // the underlying data hasn't changed.
  const lastTracesRef = useRef<Partial<Plotly.PlotData>[] | null>(null)
  const lastBarmodeRef = useRef<Plotly.Layout['barmode'] | undefined>(undefined)
  // 035-scenario-label-color: the raw, last-fetched rows — needed
  // separately from lastTracesRef so the scenario-display-only effect
  // below can re-run resolveTraces() with a NEW scenarioDisplay against
  // the SAME already-fetched data, without a new query.
  const lastRowsRef = useRef<Record<string, unknown>[] | null>(null)

  // Data fetch + Plotly.react() — re-runs on config/filters change. Never
  // purges here; react() diffs against the existing plot (docs/SPEC.md's
  // "use react() not newPlot()" guidance). Deliberately does NOT list
  // colorScheme as a dependency — see the theme-only effect below, which
  // handles that case without a redundant re-query.
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
      // type (no zonemap-style metric_id default exists — research.md
      // §1/§3); an omitted compare_on here is a config-authoring error,
      // surfacing the same defined way as any other missing-required-
      // field misconfiguration — an empty compareOn produces malformed
      // SQL, which DuckDB rejects and this panel's own existing .catch()
      // below turns into the shared PanelErrorState, same as any other
      // unresolvable configuration (spec.md Edge Cases).
      sql = buildComparisonDiffQuery(config.metric, resolvedA, resolvedB, config.compare_on ?? [], diff.expr)
    } else {
      const template = buildPanelQuery(config, filters)
      const activeScenarios = resolveActiveScenarios(config, activeScenarioNames)
      // Intentionally empty, not a stub — panel queries only ever use
      // $scenario/$filters, never $mappings/$bins/$sql (research.md §2).
      sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)
    }

    query(sql)
      .then((rows) => {
        if (cancelled || !containerRef.current) return
        if (rows.length === 0) {
          setStatus('empty')
          return
        }
        lastRowsRef.current = rows
        const traces = config.traces.flatMap((trace) => resolveTraces(trace, rows, scenarioDisplay))
        // docs/GRAMMAR.md declares barmode per-trace (traces[].barmode),
        // but Plotly.js itself expects it at the layout level
        // (layout.barmode), not on individual trace data objects — lifted
        // here rather than silently dropped.
        const barmode = config.traces.find((t) => t.barmode)?.barmode as
          | Plotly.Layout['barmode']
          | undefined
        lastTracesRef.current = traces
        lastBarmodeRef.current = barmode
        const layout: Partial<Plotly.Layout> = {
          autosize: true,
          ...resolveThemeLayout(containerRef.current, colorScheme),
          ...(config.layout ?? {}),
          ...(barmode ? { barmode } : {}),
        }
        Plotly.react(containerRef.current, traces, layout, { responsive: true })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- colorScheme
    // intentionally excluded, see comment above
  }, [config, filters, activeScenarioNames, baseline])

  // Theme-only re-render — reapplies resolveThemeLayout() colors against
  // the SAME already-fetched traces (lastTracesRef), no new query. Guarded
  // on status === 'ready' so this never fires before the effect above has
  // ever successfully rendered a plot at all (nothing for Plotly.react()
  // to diff against yet).
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || !lastTracesRef.current) return
    const layout: Partial<Plotly.Layout> = {
      autosize: true,
      ...resolveThemeLayout(containerRef.current, colorScheme),
      ...(config.layout ?? {}),
      ...(lastBarmodeRef.current ? { barmode: lastBarmodeRef.current } : {}),
    }
    Plotly.react(containerRef.current, lastTracesRef.current, layout, { responsive: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately
    // scoped to colorScheme/status only; config/lastTracesRef/lastBarmodeRef
    // are read for their CURRENT value at the time colorScheme changes, not
    // meant to re-trigger this effect on their own (that's the fetch
    // effect's job above)
  }, [colorScheme, status])

  // 035-scenario-label-color (FR-005/FR-012): scenario label/color-only
  // re-render — re-derives traces from the SAME cached rows (lastRowsRef)
  // with the new scenarioDisplay, no new query. Mirrors the theme-only
  // effect above exactly (same status === 'ready' guard, same
  // resolveThemeLayout()/barmode reuse), one hop earlier in the pipeline
  // (re-running resolveTraces() itself, not just re-applying layout to
  // already-resolved traces — a label/color change affects trace.name/
  // trace.marker.color, which lastTracesRef alone can't recompute).
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || !lastRowsRef.current) return
    const traces = config.traces.flatMap((trace) => resolveTraces(trace, lastRowsRef.current!, scenarioDisplay))
    lastTracesRef.current = traces
    const layout: Partial<Plotly.Layout> = {
      autosize: true,
      ...resolveThemeLayout(containerRef.current, colorScheme),
      ...(config.layout ?? {}),
      ...(lastBarmodeRef.current ? { barmode: lastBarmodeRef.current } : {}),
    }
    Plotly.react(containerRef.current, traces, layout, { responsive: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately
    // scoped to scenarioDisplay/status only, same reasoning as the
    // theme-only effect above
  }, [scenarioDisplay, status])

  // ResizeObserver, not just Plotly's own `responsive: true` (which only
  // reacts to window resize events): Plotly.react() above runs while this
  // effect's sibling still has the plot container at display: none (the
  // loading skeleton is shown until `status` flips to 'ready', one render
  // later) — Plotly measures a 0×0 container and never re-checks on its
  // own once the container becomes visible, since no window resize event
  // fires just because a CSS display property changed. ResizeObserver
  // does fire on exactly that transition, and on every real container
  // resize afterward (e.g. the grid row's columns re-flowing).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (containerRef.current) Plotly.Plots.resize(containerRef.current)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Unmount-only teardown — a second effect, empty deps, deliberately
  // not folded into the effect above.
  useEffect(() => {
    return () => {
      if (containerRef.current) Plotly.purge(containerRef.current)
    }
  }, [])

  if (status === 'empty') {
    return <PanelEmptyState icon={ChartNoAxesColumn} message="No data for this selection" />
  }
  if (status === 'error') {
    return <PanelErrorState message="Couldn't load this chart" />
  }

  return (
    <>
      {status === 'loading' && (
        // wftdm-design-system skill's Skeleton composition recipe (Phase 3
        // Batch 1) — a shaped skeleton (varying-height bars sitting on an
        // axis baseline), not one plain rectangle. Bar heights are
        // arbitrary placeholders (the real shape isn't known until the
        // query resolves and resolveTraces() runs) — a generic bar
        // silhouette reads as "a chart will be here" regardless of
        // whether the real trace ends up bar/scatter/line.
        <div
          className="flex flex-col justify-end gap-2"
          style={{ height: config.height ?? 350 }}
          aria-hidden="true"
        >
          <div className="flex flex-1 items-end gap-2">
            {[40, 70, 55, 90, 65, 80, 50].map((h, i) => (
              <div key={i} className="flex-1 animate-pulse rounded-t-sm bg-muted" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="h-px w-full bg-border" />
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          // 100%, not a fixed config.height ?? 350 pixel value — found
          // necessary by 004-panel-expand-dialog: this container is the
          // same DOM node whether inline (in a card sized to config.height
          // by panelExpandHost.tsx's inline anchor) or inside the large
          // expand dialog (sized by the dialog's own flex layout,
          // layout/panelExpandHost.tsx) — a hardcoded pixel height here
          // would keep the chart pinned at its small card size even once
          // relocated into the much larger dialog container. Filling
          // whichever real container it's currently placed in via 100%,
          // and letting that ancestor decide the actual pixel height, is
          // what lets 003's ResizeObserver-driven Plotly.Plots.resize()
          // (below) correctly grow the chart on expand.
          height: '100%',
          display: status === 'loading' ? 'none' : undefined,
        }}
      />
    </>
  )
}
