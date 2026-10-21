import { useEffect, useMemo, useState } from 'react'

import { useCompareInputs } from '@/hooks/useCompareInputs'
import { useResolvedView } from '@/hooks/useViewContext'
import type { ValueBoxPanelConfig } from '@/layout/types'
import { deltaValue, formatDelta } from '@/panels/compareMath'
import { formatValue } from '@/panels/formatValue'
import { query } from '@/services/duckdb'
import { runNameFor } from '@/services/runResolution'
import { ensureRegistered } from '@/services/tabDataLoader'
import { getDeployment } from '@/state/compareState'
import { cn } from '@/lib/utils'

// One KPI of the hero band (project-docs/redesign/02-layout-and-components.md section 1.4): the focus scenario's value in
// the selected year, a delta pill against the active reference with its caption, and a sparkline of the metric at each
// model year. The delta is neutral ink; only "calibrated against Observed in the base year" uses status colours.

async function readColumn(run: string, metric: string, column: string, scale = 1): Promise<number | null> {
  await ensureRegistered([{ scenario: run, metric }])
  const rows = await query(`SELECT "${column}" AS v FROM "${run}__${metric}" LIMIT 1`)
  const v = rows[0]?.v
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v) * scale
}

const SPARK_W = 64
const SPARK_H = 22

function Sparkline({ points, current }: { points: { year: number; value: number }[]; current: number }) {
  if (points.length < 2) return null
  const values = points.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const x = (i: number) => 2 + (i * (SPARK_W - 4)) / (points.length - 1)
  const y = (v: number) => SPARK_H - 3 - ((v - lo) / span) * (SPARK_H - 6)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const at = points.findIndex((p) => p.year === current)
  return (
    <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="ml-auto" aria-hidden="true" data-testid="hero-sparkline">
      <path d={d} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {at >= 0 && <circle cx={x(at)} cy={y(points[at].value)} r="3" fill="var(--brand)" />}
    </svg>
  )
}

export function HeroKpi({ config }: { config: ValueBoxPanelConfig }) {
  const view = useResolvedView()
  const { referenceLabel } = useCompareInputs()
  const [state, setState] = useState<{
    value: number | null
    reference: number | null
    series: { year: number; value: number }[]
    status: 'loading' | 'ready' | 'empty' | 'error'
  }>({ value: null, reference: null, series: [], status: 'loading' })

  const years = getDeployment().years.map((y) => y.year)
  const { focus, focusRun, referenceRun, referenceKind, year, baseYear, isBaseYear } = view
  const selfBaseRun = referenceKind === 'self-base-year' ? runNameFor(focus, baseYear) : undefined
  const refRun = referenceKind === 'self-base-year' ? selfBaseRun : referenceRun

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading' }))
    if (!focusRun) {
      setState({ value: null, reference: null, series: [], status: 'empty' })
      return
    }
    ;(async () => {
      const value = await readColumn(focusRun, config.metric, config.column, config.scale)
      const reference = refRun ? await readColumn(refRun, config.metric, config.column, config.scale) : null
      const series: { year: number; value: number }[] = []
      for (const y of years) {
        const run = runNameFor(focus, y)
        if (!run) continue
        const v = run === focusRun ? value : await readColumn(run, config.metric, config.column, config.scale)
        if (v !== null) series.push({ year: y, value: v })
      }
      if (!cancelled) setState({ value, reference, series, status: value === null ? 'empty' : 'ready' })
    })().catch((err) => {
      if (!cancelled) {
        console.error('HeroKpi: failed to load', err)
        setState((s) => ({ ...s, status: 'error' }))
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.metric, config.column, config.scale, focus, focusRun, refRun, year, years.join(',')])

  const delta = useMemo(
    () => (state.value !== null && refRun ? deltaValue(state.value, state.reference, 'pct') : null),
    [state.value, state.reference, refRun],
  )
  // status colours only when the model is being calibrated against observed data (base year, reference Observed)
  const calibrating = isBaseYear && referenceKind === 'observed'
  const tone =
    calibrating && delta !== null ? (Math.abs(delta) <= 3 ? 'ok' : Math.abs(delta) <= 5 ? 'warn' : 'fail') : 'info'

  if (state.status === 'error') return <p className="py-3 text-[13px] text-[var(--mute)]">Couldn&rsquo;t load this value</p>
  if (state.status === 'empty') return <p className="py-3 text-[13px] text-[var(--mute)]">No data for this year</p>

  return (
    <div className="flex flex-col" data-testid="hero-kpi">
      <div className="my-2 whitespace-nowrap font-mono text-[clamp(30px,3vw,42px)] font-medium leading-[1.1] tracking-[-0.04em] tabular-nums text-[var(--ink)]">
        {state.status === 'loading' ? ' ' : formatValue(state.value, config.format)}
        {config.unit && state.status === 'ready' && (
          <i className="ml-[6px] font-body text-sm font-normal not-italic tracking-normal text-[var(--mute)]">{config.unit}</i>
        )}
      </div>
      <div className="flex min-h-[22px] items-center gap-2 font-body text-[12.5px] text-[var(--mute)]">
        {state.status === 'ready' && refRun && (
          <>
            <span
              data-testid="hero-delta"
              className={cn(
                'rounded-full px-2 py-[2px] font-mono text-[12.5px] font-medium',
                tone === 'ok' && 'bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-[var(--ok)]',
                tone === 'warn' && 'bg-[color-mix(in_srgb,var(--warn)_15%,transparent)] text-[var(--warn)]',
                tone === 'fail' && 'bg-[color-mix(in_srgb,var(--fail)_15%,transparent)] text-[var(--fail)]',
                tone === 'info' && 'bg-[color-mix(in_srgb,var(--ink)_10%,transparent)] text-[var(--ink)]',
              )}
            >
              {formatDelta(delta, 'pct')}
            </span>
            <span className="min-w-0 truncate">vs {referenceLabel}</span>
          </>
        )}
        {state.status === 'ready' && <Sparkline points={state.series} current={year} />}
      </div>
    </div>
  )
}
