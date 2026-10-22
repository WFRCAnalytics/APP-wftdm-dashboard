import { useEffect, useState } from 'react'

import { loadRows } from '@/charts/dataCache'
import type { Row } from '@/charts/types'
import { useResolvedView } from '@/hooks/useViewContext'

// The "nothing to compare yet" note above the hero (project-docs/redesign/02-layout-and-components.md section 6): shown
// when Compare is on and every compared scenario has identical results for the selected year. Detected from the data
// (the headline numbers and the mode share vector), never from the year.

const TABLES = ['summary_kpis', 'trip_mode_share', 'transit_boardings'] as const

const round = (v: unknown): unknown => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)

/** A stable text signature of a run's headline tables, rows sorted so storage order does not matter. */
export function resultSignature(tables: readonly (readonly Row[])[]): string {
  return tables
    .map((rows) =>
      rows
        .map((r) =>
          Object.keys(r)
            .sort()
            .map((k) => `${k}=${String(round(r[k]))}`)
            .join('|'),
        )
        .sort()
        .join('\n'),
    )
    .join('\n--\n')
}

/** True when there are two or more signatures and all are equal and non-empty. */
export function allIdentical(signatures: readonly string[]): boolean {
  return signatures.length >= 2 && signatures.every((s) => s.length > 0 && s === signatures[0])
}

export function IdenticalNote() {
  const { compare, active, year } = useResolvedView()
  const [identical, setIdentical] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!compare || active.length < 2) {
      setIdentical(false)
      return
    }
    Promise.all(active.map((run) => Promise.all(TABLES.map((t) => loadRows(run, t))).then(resultSignature)))
      .then((signatures) => !cancelled && setIdentical(allIdentical(signatures)))
      .catch(() => !cancelled && setIdentical(false))
    return () => {
      cancelled = true
    }
  }, [compare, active, year])

  if (!identical) return null
  return (
    <p
      role="note"
      data-testid="identical-note"
      className="rounded-2xl border border-[var(--glass-line)] bg-[var(--tile-hi)] px-4 py-3 font-body text-[13px] text-[var(--mute)]"
    >
      The compared scenarios have identical results for this year, so there is nothing to compare yet. Pick another year or
      add different scenarios.
    </p>
  )
}
