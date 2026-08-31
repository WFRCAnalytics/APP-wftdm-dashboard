import { useEffect, useRef, useState } from 'react'
import { ChartNoAxesColumn } from 'lucide-react'
import * as Plotly from 'plotly.js-dist-min'

import { query } from '@/services/duckdb'
import * as sqlExpander from '@/services/sqlExpander'
import * as filterState from '@/state/filterState'
import * as appState from '@/state/appState'
import { useFilterState } from '@/hooks/useFilterState'
import { buildPanelQuery, resolveActiveScenarios, EMPTY_SUMMARIZE_CONFIG } from '@/panels/panelQuery'
import { resolveTraces } from '@/panels/plotlyTraces'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { PlotlyPanelConfig } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// Proves the full pipeline (spec.md User Story 3): YAML config -> SQL
// expansion -> query -> Plotly.react() render, filter-reactive, using
// docs/SPEC.md's corrected two-effect pattern. See contracts/plotly-panel.md.
export function PlotlyPanel({ config }: { config: PlotlyPanelConfig }) {
  const filters = useFilterState(
    config.filter ? [config.filter.replace(/^\$filters\./, '')] : ALL_FILTERS,
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')

  // Data fetch + Plotly.react() — re-runs on config/filters change. Never
  // purges here; react() diffs against the existing plot (docs/SPEC.md's
  // "use react() not newPlot()" guidance).
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    const template = buildPanelQuery(config, filters)
    const activeScenarios = resolveActiveScenarios(
      config,
      appState.getActive().map((s) => s.name),
    )
    // Intentionally empty, not a stub — panel queries only ever use
    // $scenario/$filters, never $mappings/$bins/$sql (research.md §2).
    const sql = sqlExpander.expand(template, EMPTY_SUMMARIZE_CONFIG, filterState, activeScenarios)

    query(sql)
      .then((rows) => {
        if (cancelled || !containerRef.current) return
        if (rows.length === 0) {
          setStatus('empty')
          return
        }
        const traces = config.traces.flatMap((trace) => resolveTraces(trace, rows))
        // docs/GRAMMAR.md declares barmode per-trace (traces[].barmode),
        // but Plotly.js itself expects it at the layout level
        // (layout.barmode), not on individual trace data objects — lifted
        // here rather than silently dropped.
        const barmode = config.traces.find((t) => t.barmode)?.barmode as
          | Plotly.Layout['barmode']
          | undefined
        const layout: Partial<Plotly.Layout> = {
          ...(config.layout ?? {}),
          ...(barmode ? { barmode } : {}),
        }
        Plotly.react(containerRef.current, traces, layout)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [config, filters])

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
        <div
          className="animate-pulse rounded-md bg-muted"
          style={{ height: config.height ?? 350 }}
        />
      )}
      <div
        ref={containerRef}
        style={{ height: config.height ?? 350, display: status === 'loading' ? 'none' : undefined }}
      />
    </>
  )
}
