// Maps the tables a real deployment publishes onto the tables the chart kinds read (project-docs/redesign/06 section 3).
// A kind asks for a logical table (`trip_mode_share_by_purpose`, `trips_by_hour_purpose`, `zone_transit_share`...); when
// the run lacks it but has the source tables, it is derived here, and raw category values (SOV, work, Very Low, 0) are
// mapped onto the deployment's display vocabulary (charts/vocab.ts), summing rows that share a label. A run that already
// publishes the logical table in the chart vocabulary passes through unchanged. Pure: rows in, rows out.
import type { Row } from '@/charts/types'
import { aliasValue, hasAliases, MODES } from '@/charts/vocab'

export interface RawSource {
  has(table: string): boolean
  rows(table: string): Promise<Row[]>
}

const num = (r: Row, k: string): number => Number(r[k])

/** The label for raw values a configured vocabulary does not list. */
export const OTHER = 'Other'

/** Sums `sumCols` over rows grouped by the given dimensions, mapping each dimension through the vocabulary (a `null`
 * dimension, like the departure hour, has none and groups on the raw value). Values the vocabulary does not list are
 * summed under "Other", joining a vocabulary entry already labelled that. */
export function regroup(
  rows: readonly Row[],
  dims: { column: string; dimension: Parameters<typeof aliasValue>[0] | null }[],
  sumCols: string[],
): Row[] {
  const out = new Map<string, Row>()
  for (const r of rows) {
    const mapped: Record<string, string> = {}
    for (const d of dims) {
      // a value the deployment's vocabulary does not list is folded into "Other", so totals and shares stay whole
      mapped[d.column] = d.dimension && hasAliases(d.dimension) ? (aliasValue(d.dimension, r[d.column]) ?? OTHER) : String(r[d.column])
    }
    const key = dims.map((d) => mapped[d.column]).join('\u0001')
    const row = out.get(key) ?? { ...mapped, ...Object.fromEntries(sumCols.map((c) => [c, 0])) }
    for (const c of sumCols) row[c] = (row[c] as number) + (num(r, c) || 0)
    out.set(key, row)
  }
  return [...out.values()]
}

/** Adds `share` = value / total within each group of `groupBy` (all rows when empty). */
export function withShare(rows: Row[], valueCol: string, groupBy: string[] = [], shareCol = 'share'): Row[] {
  const totals = new Map<string, number>()
  const keyOf = (r: Row) => groupBy.map((g) => String(r[g])).join('\u0001')
  for (const r of rows) totals.set(keyOf(r), (totals.get(keyOf(r)) ?? 0) + num(r, valueCol))
  return rows.map((r) => ({ ...r, [shareCol]: totals.get(keyOf(r)) ? num(r, valueCol) / (totals.get(keyOf(r)) as number) : 0 }))
}

const ACTIVE = /walk|bike|non-?motor/i

export async function adaptTable(table: string, src: RawSource): Promise<Row[] | null> {
  switch (table) {
    case 'trip_mode_share': {
      if (!src.has(table)) return null
      if (!hasAliases('major_trip_mode')) {
        const rows = await src.rows(table)
        return rows.every((r) => r.share !== undefined) ? rows : withShare(rows, 'trips')
      }
      return withShare(regroup(await src.rows(table), [{ column: 'major_trip_mode', dimension: 'major_trip_mode' }], ['trips']), 'trips')
    }
    case 'purpose_mode_flow': {
      if (!src.has(table)) return null
      if (!hasAliases('major_trip_mode') && !hasAliases('primary_purpose')) return src.rows(table)
      return regroup(
        await src.rows(table),
        [
          { column: 'primary_purpose', dimension: 'primary_purpose' },
          { column: 'major_trip_mode', dimension: 'major_trip_mode' },
        ],
        ['trips'],
      )
    }
    case 'purpose_mode_distance_flow': {
      // a run without distances still gets the purpose > mode part of the flow (the chart then has two columns)
      if (src.has(table)) return src.rows(table)
      return adaptTable('purpose_mode_flow', src)
    }
    case 'trip_mode_share_by_purpose': {
      if (src.has(table)) return src.rows(table)
      const flow = await adaptTable('purpose_mode_flow', src)
      return flow ? withShare(flow, 'trips', ['primary_purpose']) : null
    }
    case 'auto_ownership_summary': {
      if (!src.has(table)) return null
      if (!hasAliases('auto_ownership') && !hasAliases('income_group')) return src.rows(table)
      return regroup(
        await src.rows(table),
        [
          { column: 'auto_ownership', dimension: 'auto_ownership' },
          { column: 'income_group', dimension: 'income_group' },
        ],
        ['households'],
      )
    }
    case 'trips_by_hour_purpose': {
      if (src.has(table)) return src.rows(table)
      if (!src.has('trip_scheduling')) return null
      const rows = regroup(
        await src.rows('trip_scheduling'),
        [
          { column: 'primary_purpose', dimension: 'primary_purpose' },
          { column: 'depart_hour', dimension: null },
        ],
        ['trips'],
      )
      return fillHours(rows)
    }
    case 'trips_by_hour': {
      if (src.has(table)) return src.rows(table)
      if (!src.has('trip_scheduling')) return null
      const byHour = new Array<number>(24).fill(0)
      for (const r of await src.rows('trip_scheduling')) {
        const h = num(r, 'depart_hour')
        if (h >= 0 && h < 24) byHour[h] += num(r, 'trips') || 0
      }
      return byHour.map((trips, hour) => ({ hour, trips }))
    }
    case 'summary_kpis': {
      if (!src.has(table)) return null
      const [kpi] = await src.rows(table)
      if (!kpi) return []
      const out: Row = { ...kpi }
      if (out.transit_share === undefined && src.has('trip_mode_share')) {
        const shares = (await adaptTable('trip_mode_share', src)) ?? []
        const of = (test: (label: string) => boolean) => shares.filter((r) => test(String(r.major_trip_mode))).reduce((s, r) => s + num(r, 'share'), 0)
        out.drive_share = of((l) => l === MODES[0])
        out.transit_share = of((l) => l === 'Transit')
        out.active_share = of((l) => ACTIVE.test(l))
      }
      if (out.avg_trip_length_miles === undefined && src.has('trip_distance_by_purpose')) {
        const d = await src.rows('trip_distance_by_purpose')
        const trips = d.reduce((s, r) => s + num(r, 'trips'), 0)
        if (trips) out.avg_trip_length_miles = d.reduce((s, r) => s + num(r, 'avg_distance_miles') * num(r, 'trips'), 0) / trips
      }
      return [out]
    }
    case 'zone_transit_share': {
      if (src.has(table)) return src.rows(table)
      if (!src.has('trip_ends_by_zone_mode')) return null
      const ends = await src.rows('trip_ends_by_zone_mode')
      const pop = new Map<number, number>()
      if (src.has('land_use_summary')) for (const r of await src.rows('land_use_summary')) pop.set(num(r, 'zone_id'), num(r, 'TOTPOP'))
      const zones = new Map<number, { all: number; transit: number; district: string }>()
      for (const r of ends) {
        const z = num(r, 'zone_id')
        const e = zones.get(z) ?? { all: 0, transit: 0, district: String(r.district ?? '') }
        const t = num(r, 'trips') || 0
        e.all += t
        if (aliasValue('major_trip_mode', r.major_trip_mode) === 'Transit' || String(r.major_trip_mode) === 'Transit') e.transit += t
        zones.set(z, e)
      }
      return [...zones].map(([taz_id, e]) => ({
        taz_id,
        transit_share: e.all ? e.transit / e.all : 0,
        residents: pop.get(taz_id) ?? 0,
        district: e.district,
      }))
    }
    case 'population_age_sex': {
      if (src.has(table)) return src.rows(table)
      if (!src.has('person_household_profile')) return null
      const bands = Array.from({ length: 17 }, (_, i) => (i === 16 ? '80+' : `${i * 5}-${i * 5 + 4}`))
      const counts = new Map<string, number>()
      for (const r of await src.rows('person_household_profile')) {
        // a missing, blank or non-numeric age, or a sex code other than 1 (male) / 2 (female), is not a person we can place
        const age = r.age == null || r.age === '' ? NaN : num(r, 'age')
        const sex = num(r, 'sex') === 1 ? 'Male' : num(r, 'sex') === 2 ? 'Female' : undefined
        if (!(age >= 0) || !sex) continue
        const band = bands[Math.min(16, Math.floor(age / 5))]
        counts.set(`${band}|${sex}`, (counts.get(`${band}|${sex}`) ?? 0) + 1)
      }
      return bands.flatMap((age_band) => ['Male', 'Female'].map((sex) => ({ age_band, sex, persons: counts.get(`${age_band}|${sex}`) ?? 0 })))
    }
    default:
      return src.has(table) ? src.rows(table) : null
  }
}

/** Every purpose has a row for each hour 0..23 (zeros included) so lines and heatmaps keep a stable shape. */
function fillHours(rows: Row[]): Row[] {
  const purposes = [...new Set(rows.map((r) => String(r.primary_purpose)))]
  const lookup = new Map(rows.map((r) => [`${r.primary_purpose}|${r.depart_hour}`, num(r, 'trips')]))
  return purposes.flatMap((primary_purpose) =>
    Array.from({ length: 24 }, (_, hour) => ({ hour, primary_purpose, trips: lookup.get(`${primary_purpose}|${hour}`) ?? 0 })),
  )
}
