// 065-chart-builder: which chart types fit the columns on the shelves. Scored like Graphic Walker's rules, held as data so
// the numbers are testable: each mark has a test over the column counts, a score, and the reason shown when it is not viable.
import { MARKS, type ChartSpec, type Mark } from '@/charts/builder/spec'
import type { Role } from '@/charts/builder/columnTypes'

export interface Suggestion { viable: boolean; score: number; reason: string }
export interface Suggestions { byMark: Record<Mark, Suggestion>; best: Mark | null; total: number }

interface Counts { q: number; cat: number; t: number; total: number }

const RULES: Record<Mark, { test(c: Counts, ordered: boolean, pieOk: boolean): boolean; score(c: Counts, ordered: boolean): number; reason: string }> = {
  bar: { test: (c) => c.cat >= 1 && c.q >= 1, score: () => 85, reason: 'Needs a category and a number' },
  line: { test: (c) => c.q >= 1 && (c.cat >= 1 || c.t >= 1 || c.q >= 2), score: (_c, o) => (o ? 92 : 70), reason: 'Needs a number and an ordered field' },
  area: { test: (c) => c.q >= 1 && (c.cat >= 1 || c.t >= 1 || c.q >= 2), score: (_c, o) => (o ? 66 : 52), reason: 'Needs a number and an ordered field' },
  scatter: { test: (c) => c.q >= 2, score: () => 93, reason: 'Needs two numbers' },
  histogram: { test: (c) => c.q >= 1 && c.cat <= 1, score: (c) => (c.total === 1 ? 90 : 55), reason: 'Needs a number to bin' },
  box: { test: (c) => c.q >= 1 && c.cat >= 1, score: () => 66, reason: 'Needs a number and a category' },
  heatmap: { test: (c) => c.cat >= 2, score: () => 70, reason: 'Needs two categories' },
  // pie is scored low on purpose: it is rarely the clearest choice
  pie: { test: (c, _o, pieOk) => c.cat === 1 && c.q === 1 && pieOk, score: () => 35, reason: 'Needs one category (12 or fewer) and a number' },
  tick: { test: (c) => c.q >= 1 && c.cat <= 1, score: (c) => (c.total === 1 ? 40 : 30), reason: 'Needs a number, and at most one category' },
  text: { test: (c) => c.cat >= 2 && c.q >= 1, score: () => 45, reason: 'Needs two categories and a number' },
  waffle: { test: (c, _o, pieOk) => c.cat === 1 && c.q === 1 && pieOk, score: () => 30, reason: 'Needs one category (12 or fewer) and a number' },
}

/** `roleOf` gives a field's chart role; `distinct` the number of distinct values of a field (for the pie limit). */
export function suggest(spec: ChartSpec, roleOf: (field: string) => Role, distinct: (field: string) => number): Suggestions {
  const fields = Array.from(new Set(Object.values(spec.enc).map((e) => e!.f)))
  const c: Counts = { q: 0, cat: 0, t: 0, total: fields.length }
  for (const f of fields) {
    const r = roleOf(f)
    if (r === 'q') c.q++
    else if (r === 't') c.t++
    else if (r) c.cat++
  }
  const xr = spec.enc.x ? roleOf(spec.enc.x.f) : ''
  const ordered = xr === 'q' || xr === 't' || c.t > 0
  const pieOk = !spec.enc.color || distinct(spec.enc.color.f) <= 12
  const byMark = {} as Record<Mark, Suggestion>
  let best: Mark | null = null
  for (const m of MARKS) {
    const rule = RULES[m]
    const viable = c.total === 0 ? true : rule.test(c, ordered, pieOk)
    byMark[m] = { viable, score: rule.score(c, ordered), reason: rule.reason }
    if (c.total > 0 && viable && (!best || byMark[m].score > byMark[best].score)) best = m
  }
  return { byMark, best, total: c.total }
}
