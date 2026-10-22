import { useEffect, useMemo, useState } from 'react'

import { useCompareInputs } from '@/hooks/useCompareInputs'
import { useResolvedView } from '@/hooks/useViewContext'
import type { ValueBoxPanelConfig } from '@/layout/types'
import { deltaValue, formatDelta } from '@/panels/compareMath'
import { formatValue } from '@/panels/formatValue'
import { loadRows } from '@/charts/dataCache'
import { runNameFor } from '@/services/runResolution'
import { getDeployment } from '@/state/compareState'
import { cn } from '@/lib/utils'
import { tagTintStyle } from '@/lib/tagTint'

// One KPI of the hero band (project-docs/redesign/02-layout-and-components.md section 1.4): the focus scenario's value in
// the selected year, a delta pill against the active reference with its caption, and a sparkline of the metric at each
// model year. The delta is neutral ink; only "calibrated against Observed in the base year" uses status colours.

async function readColumn(run: string, metric: string, column: string, scale = 1): Promise<number | null> {
  // through the chart data adapters, so derived columns (shares, average trip length) exist for runs that do not publish them
  const rows = await loadRows(run, metric)
  const v = rows[0]?.[column]
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

const RING_W = 108
const RING_H = 54
const RING_R = 38

/** A half-circle dial (0 at 9 o'clock, `max` at 3 o'clock): the value as a filled arc, the reference as a tick. */
function Ring({ value, reference, max, unit }: { value: number; reference: number | null; max: number; unit?: string }) {
  const cx = RING_W / 2
  const cy = RING_H - 6
  const at = (v: number) => Math.PI * (1 - Math.min(1, Math.max(0, v / max)))
  const pt = (a: number, r: number) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy - Math.sin(a) * r).toFixed(1)}`
  const arc = (a0: number, a1: number) => `M${pt(a0, RING_R)} A${RING_R} ${RING_R} 0 0 1 ${pt(a1, RING_R)}`
  const a = at(value)
  const ref = reference === null ? null : at(reference)
  return (
    <svg width={RING_W} height={RING_H} viewBox={`0 0 ${RING_W} ${RING_H}`} className="ml-auto shrink-0" role="img" aria-label={`${value.toFixed(1)} of ${max}${unit ?? ''}`} data-testid="hero-ring">
      <path d={arc(Math.PI, 0)} fill="none" stroke="var(--grid)" strokeWidth="7" strokeLinecap="round" />
      {value > 0 && <path d={arc(Math.PI, a)} fill="none" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" />}
      {ref !== null && (
        <line x1={pt(ref, RING_R - 7).split(' ')[0]} y1={pt(ref, RING_R - 7).split(' ')[1]} x2={pt(ref, RING_R + 7).split(' ')[0]} y2={pt(ref, RING_R + 7).split(' ')[1]} stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
      )}
      <text x={cx - RING_R} y={RING_H} textAnchor="middle" fontSize="9" fill="var(--mute)">0</text>
      <text x={cx + RING_R} y={RING_H} textAnchor="middle" fontSize="9" fill="var(--mute)">{`${max}${unit ?? ''}`}</text>
    </svg>
  )
}

export function HeroKpi({ config }: { config: ValueBoxPanelConfig }) {
  const view = useResolvedView()
  const { referenceLabel, referenceColor } = useCompareInputs()
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
      <div className="flex items-end gap-2">
        <div className="my-2 whitespace-nowrap font-mono text-[clamp(30px,3vw,42px)] font-medium leading-[1.1] tracking-[-0.04em] tabular-nums text-[var(--ink)]">
          {state.status === 'loading' ? ' ' : formatValue(state.value, config.format)}
          {config.unit && state.status === 'ready' && (
            <i className="ml-[6px] font-body text-sm font-normal not-italic tracking-normal text-[var(--mute)]">{config.unit}</i>
          )}
        </div>
        {config.ring && state.status === 'ready' && state.value !== null && (
          <Ring value={state.value} reference={refRun ? state.reference : null} max={config.ring.max} unit={config.unit} />
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
            <span
              className="min-w-0 truncate rounded-full bg-[var(--tag-neutral-bg)] px-2 py-[2px] text-[var(--tag-neutral-fg)]"
              style={referenceColor ? tagTintStyle(referenceColor, 18) : undefined}
            >
              vs {referenceLabel}
            </span>
          </>
        )}
        {state.status === 'ready' && <Sparkline points={state.series} current={year} />}
      </div>
    </div>
  )
}
