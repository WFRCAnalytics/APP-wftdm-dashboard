// 065-chart-builder: folds the small values of a field into one "Other", so a legend never has to be cut. Pure; tests/unit/chartBuilderOther.test.ts.
import type { Row } from '@/charts/builder/compile'
import { OTHER_AUTO_KEEP, type OtherOpts } from '@/charts/builder/spec'

/** The name of the folded group. A real value called "Other" joins it. */
export const OTHER = 'Other'

/**
 * Rows with the small values of `field` merged into one value, `Other`. The values are ranked by their total of `valueField`
 * (a sum or a count, so the folded rows can be added together). A single small value is left as it is: a group of one is no
 * simpler to read. `folded` is how many values went into Other (0 when nothing changed).
 *
 * - auto: keeps the 7 largest, and folds the rest when there are more than 8 values
 * - top: keeps the `n` largest
 * - percent: folds the values under `pct` percent of the total
 */
export function foldOther(rows: Row[], field: string, valueField: string, o: OtherOpts): { rows: Row[]; folded: number } {
  if (o.mode === 'off') return { rows, folded: 0 }
  const total = new Map<string, number>()
  for (const r of rows) total.set(String(r[field]), (total.get(String(r[field])) ?? 0) + (Number(r[valueField]) || 0))
  const ranked = [...total.entries()].sort((a, b) => b[1] - a[1])
  const grand = ranked.reduce((n, e) => n + Math.max(0, e[1]), 0) || 1
  let drop: string[]
  if (o.mode === 'auto') drop = ranked.length > OTHER_AUTO_KEEP + 1 ? ranked.slice(OTHER_AUTO_KEEP).map((e) => e[0]) : []
  else if (o.mode === 'top') drop = ranked.slice(Math.max(1, Math.round(o.n))).map((e) => e[0])
  else drop = ranked.filter((e) => (Math.max(0, e[1]) / grand) * 100 < o.pct).map((e) => e[0])
  // a real "Other" among the kept values is part of the group when something folds into it
  if (drop.length < 2 && !(drop.length === 1 && total.has(OTHER) && drop[0] !== OTHER)) return { rows, folded: 0 }
  const fold = new Set(drop)
  const merged = new Map<string, Row>()
  for (const r of rows) {
    const next: Row = fold.has(String(r[field])) ? { ...r, [field]: OTHER } : r
    const key = JSON.stringify(Object.entries(next).filter(([k]) => k !== valueField))
    const hit = merged.get(key)
    if (hit) hit[valueField] = (Number(hit[valueField]) || 0) + (Number(next[valueField]) || 0)
    else merged.set(key, { ...next })
  }
  return { rows: [...merged.values()], folded: drop.length }
}
