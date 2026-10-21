// The calibration-rounds roll-up (project-docs/redesign/06-data-and-config.md section 5): ONE Parquet file holding every
// round x series, so the progress tile and the picker's round strip never open the 50 round folders. It lives in the
// family's own folder next to the runs: `<runs folder>/families/<family>/calibration_by_round.parquet`.
import { get, list } from '@/state/appState'
import { query, registerFileURL } from '@/services/duckdb'

export interface RollupRow {
  round: number
  metric_group: string
  series: string
  value: number
  observed_value: number
}

const inflight = new Map<string, Promise<RollupRow[]>>()

/** URL of a family's roll-up, derived from where its round runs are served from; undefined with no rounds. */
export function rollupUrl(family: string, file = 'calibration_by_round'): string | undefined {
  const round = list().find((s) => s.kind === 'round' && (s.family ?? '') === family)
  const path = round && get(round.name)?.path
  if (!path) return undefined
  // the run's served folder may end in /summary; the families folder sits beside the run folders
  const parent = path.replace(/\/+$/, '').replace(/\/summary$/, '').replace(/\/[^/]+$/, '')
  return `${parent}/families/${family}/${file}.parquet`
}

export function loadFamilyRollup(family: string, file = 'calibration_by_round'): Promise<RollupRow[]> {
  const key = `${family}/${file}`
  const hit = inflight.get(key)
  if (hit) return hit
  const url = rollupUrl(family, file)
  if (!url) return Promise.resolve([])
  const view = `family__${family}__${file}`.replace(/[^A-Za-z0-9_]/g, '_')
  const p = registerFileURL(view, url)
    .then(() => query(`SELECT * FROM "${view}"`))
    .then((rows) => rows.map((r) => ({ ...r, round: Number(r.round), value: Number(r.value), observed_value: Number(r.observed_value) }) as RollupRow))
    .catch((err) => {
      inflight.delete(key)
      console.error(`familyRollup: failed to load ${url}`, err)
      return [] as RollupRow[]
    })
  inflight.set(key, p)
  return p
}

/** Status of a round from its worst submodel error: ok within the tolerance, warn up to 5, else fail. */
export function roundStatus(worstErrorPct: number, tolerance = 3): 'ok' | 'warn' | 'fail' {
  return worstErrorPct <= tolerance ? 'ok' : worstErrorPct <= Math.max(5, tolerance + 2) ? 'warn' : 'fail'
}

/** Worst submodel error of each round (the `submodel_error` rows), by round number. */
export function worstErrorByRound(rows: readonly RollupRow[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of rows) if (r.metric_group === 'submodel_error') out.set(r.round, Math.max(out.get(r.round) ?? 0, r.value))
  return out
}

/** Mean submodel error of each round, for the picker's "Best". */
export function meanErrorByRound(rows: readonly RollupRow[]): Map<number, number> {
  const sums = new Map<number, { s: number; n: number }>()
  for (const r of rows) {
    if (r.metric_group !== 'submodel_error') continue
    const e = sums.get(r.round) ?? { s: 0, n: 0 }
    sums.set(r.round, { s: e.s + r.value, n: e.n + 1 })
  }
  return new Map([...sums].map(([k, v]) => [k, v.s / v.n]))
}
