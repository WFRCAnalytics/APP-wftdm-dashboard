import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChartNoAxesColumn } from 'lucide-react'

import { ChartLegend } from '@/charts/ChartLegend'
import { loadChartData } from '@/charts/dataCache'
import { facetChannel } from '@/charts/lib/facetSync'
import { loadKind } from '@/charts/kinds'
import { buildChartPlan, runsToLoad } from '@/charts/plan'
import { readChartTheme } from '@/charts/theme'
import type { ChartEnv, ChartKind, ChartPlan, LegendSpec } from '@/charts/types'
import { useCompareInputs } from '@/hooks/useCompareInputs'
import { useTileKey } from '@/hooks/useTileState'
import { useColorScheme } from '@/hooks/useColorScheme'
import { useScenarioDisplay } from '@/hooks/useScenarioDisplay'
import { useViewContext } from '@/hooks/useViewContext'
import { useTileLegendSlot } from '@/layout/tile'
import { useRegisterTileExport } from '@/layout/tileExport'
import { exportTables } from '@/charts/exportRows'
import type { ChartPanelConfig } from '@/layout/types'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { resolveScenarioColor } from '@/panels/scenarioDisplay'
import type { PanelProps } from '@/panels/registry'
import { scenarioGroupOf, runKindOf, runNameFor, viewManifest } from '@/services/runResolution'
import { getDeployment } from '@/state/compareState'
import { get as getScenario, list as listScenarios } from '@/state/appState'
import { tooltip } from '@/services/tooltip'

// One component for every chart of the catalogue (project-docs/redesign/04-chart-catalogue.md): resolves which runs to
// show from the view context, loads their tables, then hands a ChartEnv to the kind's `draw` and redraws on resize,
// theme, data or view changes. The kind never reads a store.

const DEFAULT_HEIGHT = 360

type Status = 'loading' | 'ready' | 'empty' | 'error'

// Side-by-side cells all return the same legend; only the first cell to render claims the tile's legend row.
const legendOwners = new WeakMap<HTMLElement, symbol>()

export function ChartPanel({ config }: PanelProps<ChartPanelConfig>) {
  const view = useViewContext()
  const { referenceLabel } = useCompareInputs()
  const display = useScenarioDisplay()
  const colorScheme = useColorScheme()
  const legendSlot = useTileLegendSlot()
  const tileKey = useTileKey()

  const containerRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(Symbol('chart'))
  const stateRef = useRef<Record<string, unknown>>({})
  const [kind, setKind] = useState<ChartKind | null>(null)
  const [data, setData] = useState<{ plan: ChartPlan; data: ChartEnv['data']; extra: unknown } | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState<string>('')
  const [legend, setLegend] = useState<LegendSpec | undefined>()
  const [tick, setTick] = useState(0)

  const plan = useMemo(() => {
    const manifest = viewManifest()
    return buildChartPlan({
      config,
      view,
      // Observed is a reference, never a series
      active: view.active.filter((run) => {
        const s = getScenario(run)
        return !s || runKindOf(s) !== 'observed'
      }),
      referenceLabel,
      years: getDeployment().years,
      label: (run) => display.get(run)?.label ?? getScenario(run)?.label ?? run,
      color: (run) => resolveScenarioColor(run, display) ?? '#8a94a6',
      scenarioGroupOf: (run) => {
        const s = getScenario(run)
        return s ? scenarioGroupOf(s) : run
      },
      runFor: runNameFor,
      rounds: listScenarios()
        .filter((s) => runKindOf(s) === 'round')
        .sort((a, b) => (a.familyIndex ?? 0) - (b.familyIndex ?? 0))
        .map((s) => ({ round: s.familyIndex ?? 0, run: s.name, scenarioGroup: scenarioGroupOf(s), label: display.get(s.name)?.label ?? s.name, color: resolveScenarioColor(s.name, display) ?? '#8a94a6' })),
      roundOf: (run) => {
        const s = getScenario(run)
        return s && runKindOf(s) === 'round' ? s.familyIndex : undefined
      },
      observedRun: manifest.runs.find((r) => r.kind === 'observed' && r.ready)?.name,
    })
  }, [config, view, referenceLabel, display])

  useEffect(() => {
    let cancelled = false
    loadKind(config.kind).then(
      (k) => !cancelled && setKind(k),
      (err: Error) => {
        if (cancelled) return
        setMessage(err.message)
        setStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [config.kind])

  // Load the tables the kind needs for the runs this plan shows.
  useEffect(() => {
    if (!kind) return
    let cancelled = false
    if (plan.scenarios.length === 0) {
      setStatus('empty')
      setMessage(`No data for ${view.focus} in ${view.year}.`)
      return
    }
    setStatus('loading')
    const tables = kind.tables(plan)
    const runs = runsToLoad(plan, kind.extraRuns?.(plan) ?? [])
    Promise.all([loadChartData(runs, tables), kind.loadExtra ? kind.loadExtra(plan) : Promise.resolve(undefined)])
      .then(([loaded, extra]) => {
        if (cancelled) return
        setData({ plan, data: loaded, extra })
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        console.error('ChartPanel: failed to load', err)
        setMessage("Couldn't load this chart")
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, plan])

  useEffect(
    () => () => {
      if (kind?.destroy) kind.destroy(stateRef.current)
    },
    [kind],
  )

  // Draw, and redraw on resize, theme or data change.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !kind || !data || status !== 'ready') return
    let dispose: (() => void) | undefined
    let lastW = -1
    let lastH = -1

    const draw = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      if (width < 2 || height < 2) return
      lastW = width
      lastH = height
      dispose?.()
      dispose = undefined
      tooltip.hide()
      const env: ChartEnv = {
        ...data.plan,
        width,
        height,
        data: data.data,
        theme: readChartTheme(el),
        state: stateRef.current,
        redraw: () => setTick((t) => t + 1),
        sync: (name) => facetChannel(`${tileKey || idRef.current.description}|${config.kind}|${config.group ?? ''}|${config.variant ?? ''}|${name}`),
        setYear: view.setYear,
        focusScenarioGroup: (alt) => view.pickScenario(alt, false),
        toggleCompare: (alt) => view.pickScenario(alt, true),
        extra: data.extra,
      }
      try {
        const result = kind.draw(el, env)
        dispose = result?.dispose
        setLegend(result?.legend)
        if (result?.label) el.setAttribute('aria-label', result.label)
      } catch (err) {
        console.error(`ChartPanel: drawing "${config.kind}" failed`, err)
        setMessage("Couldn't draw this chart")
        setStatus('error')
      }
    }

    draw()
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (el.clientWidth !== lastW || el.clientHeight !== lastH) draw()
      })
    })
    observer.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      dispose?.()
      tooltip.hide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, data, status, colorScheme, tick, view.setYear, view.pickScenario])

  useRegisterTileExport(kind && data && status === 'ready' ? () => exportTables(kind, data.plan, data.data) : null)

  const runColors = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of plan.scenarios) m.set(s.color.toLowerCase(), s.run)
    return m
  }, [plan])

  // Claimed in an effect, never in render: a render React throws away (Suspense, a remount) would leave a stale owner
  // behind and the real chart would never get the legend row.
  const [ownsLegend, setOwnsLegend] = useState(!legendSlot)
  useLayoutEffect(() => {
    const slot = legendSlot
    const id = idRef.current
    if (!slot) {
      setOwnsLegend(true)
      return
    }
    if (!legendOwners.has(slot)) legendOwners.set(slot, id)
    setOwnsLegend(legendOwners.get(slot) === id)
    return () => {
      if (legendOwners.get(slot) === id) legendOwners.delete(slot)
    }
  }, [legendSlot])

  const legendNode = legend && ownsLegend && (
    <ChartLegend spec={legend} chartEl={containerRef.current} runColors={runColors} />
  )

  return (
    <div className="flex flex-col" style={{ height: config.height ?? DEFAULT_HEIGHT }}>
      {legendNode && (legendSlot ? createPortal(legendNode, legendSlot) : <div className="pb-2 text-[12.5px] text-[var(--mute)]">{legendNode}</div>)}
      {status === 'empty' && <PanelEmptyState icon={ChartNoAxesColumn} message={message || 'No data for this selection'} />}
      {status === 'error' && <PanelErrorState message={message || "Couldn't load this chart"} />}
      {status === 'loading' && <div className="flex-1 animate-pulse rounded-xl bg-[var(--tile-hi)]" aria-hidden="true" />}
      <div
        ref={containerRef}
        role="img"
        aria-label={config.title}
        data-chart-kind={config.kind}
        className="relative min-h-0 w-full flex-1"
        style={{ display: status === 'ready' ? undefined : 'none' }}
      />
    </div>
  )
}
