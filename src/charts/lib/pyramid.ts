// Pure data building for the population pyramid (project-docs/redesign/04-chart-catalogue.md section 16).

export const AGE_BANDS = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80+'] as const

export type Sex = 'Male' | 'Female'

export interface PyramidRow {
  age: string
  sex: Sex
  /** Persons in thousands, males negative. */
  v: number
  /** Census estimate in thousands, same sign convention. */
  o: number
  /** Margin of error in thousands (positive), null when the observed table has none. */
  moe: number | null
}

interface Cell {
  persons: number
  moe: number | null
}

type PopRow = { age_band: string; sex: string; persons: number; moe?: number | null }

const index = (rows: readonly PopRow[]): Map<string, Cell> =>
  new Map(rows.map((r) => [`${r.age_band}|${r.sex}`, { persons: r.persons, moe: r.moe == null || Number.isNaN(r.moe) ? null : r.moe }]))

/** One row per age band and sex, in AGE_BANDS order (a missing band is zero); persons are converted to thousands. */
export function pyramidRows(model: readonly PopRow[], observed: readonly PopRow[]): PyramidRow[] {
  const m = index(model)
  const o = index(observed)
  return AGE_BANDS.flatMap((age) =>
    (['Male', 'Female'] as const).map((sex) => {
      const sign = sex === 'Male' ? -1 : 1
      const ob = o.get(`${age}|${sex}`)
      return {
        age,
        sex,
        v: (sign * (m.get(`${age}|${sex}`)?.persons ?? 0)) / 1000,
        o: (sign * (ob?.persons ?? 0)) / 1000,
        moe: ob?.moe == null ? null : ob.moe / 1000,
      }
    }),
  )
}

/** "+3k" or "−2k" rounded to whole thousands; "0k" when the rounded difference is zero. */
export function pyramidDifference(v: number, o: number): string {
  const d = Math.abs(v) - Math.abs(o)
  const r = Math.round(Math.abs(d))
  return `${r === 0 ? '' : d >= 0 ? '+' : '−'}${r}k`
}

/** x tick label: absolute thousands, so a symmetric axis reads 100k 50k 0k 50k 100k. */
export const pyramidTick = (d: number): string => {
  const a = Math.abs(d)
  // a small population (a few hundred per band) reads in persons, not fractions of a thousand
  return a > 0 && a < 1 ? String(Math.round(a * 1000)) : `${a}k`
}
