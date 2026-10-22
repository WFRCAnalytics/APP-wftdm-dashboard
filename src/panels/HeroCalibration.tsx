import { useEffect, useState } from 'react'

import { useResolvedView } from '@/hooks/useViewContext'
import type { ValueBoxPanelConfig } from '@/layout/types'
import { query } from '@/services/duckdb'
import { ensureRegistered } from '@/services/tabDataLoader'

// The Calibration cell of the hero band (project-docs/redesign/02-layout-and-components.md section 1.4): how many
// submodels are within tolerance, as "5 of 8" with one status square per submodel (ok within the tolerance, warn up to
// 5%, fail beyond). Calibration is measured on the base year, so the focus scenario's errors are shown in every year.

export type CalibrationStatus = 'ok' | 'warn' | 'fail'

/** Within the tolerance is ok, up to 5% review, beyond that off target (the prototype's `status`). */
export function calibrationStatus(errorPct: number, tolerance = 3): CalibrationStatus {
  return errorPct <= tolerance ? 'ok' : errorPct <= Math.max(5, tolerance + 2) ? 'warn' : 'fail'
}

export function HeroCalibration({ config }: { config: ValueBoxPanelConfig }) {
  const { focusRun } = useResolvedView()
  const tolerance = config.tolerance ?? 3
  const [errors, setErrors] = useState<number[] | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!focusRun) {
      setErrors(null)
      return
    }
    ensureRegistered([{ scenario: focusRun, metric: 'calibration_errors' }])
      .then(() => query(`SELECT worst_segment_error_pct AS e FROM "${focusRun}__calibration_errors"`))
      .then((rows) => !cancelled && setErrors(rows.map((r) => Number(r.e))))
      .catch((err) => {
        console.error('HeroCalibration: failed to load', err)
        if (!cancelled) setErrors(null)
      })
    return () => {
      cancelled = true
    }
  }, [focusRun])

  if (!errors) return <p className="py-3 text-[13px] text-[var(--mute)]">No calibration data for this run</p>
  const statuses = errors.map((e) => calibrationStatus(e, tolerance))
  const ok = statuses.filter((s) => s === 'ok').length
  return (
    <div className="flex flex-col" data-testid="hero-calibration">
      <div className="my-2 whitespace-nowrap font-mono text-[clamp(30px,3vw,42px)] font-medium leading-[1.1] tracking-[-0.04em] tabular-nums text-[var(--ink)]">
        {ok}
        <i className="ml-[6px] font-body text-sm font-normal not-italic tracking-normal text-[var(--mute)]">of {errors.length}</i>
      </div>
      <div
        className="mt-[2px] flex gap-1"
        role="img"
        aria-label={`${ok} of ${errors.length} submodels within ${tolerance}%`}
        title={`submodels within ${tolerance}%`}
      >
        {statuses.map((s, i) => (
          <i
            key={i}
            className="size-[14px] rounded-[5px]"
            style={{ background: s === 'ok' ? 'var(--ok)' : s === 'warn' ? 'var(--warn)' : 'var(--fail)' }}
          />
        ))}
      </div>
    </div>
  )
}
