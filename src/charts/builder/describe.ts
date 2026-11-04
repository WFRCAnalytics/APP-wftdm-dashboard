// 065-chart-builder: a plain-language description of a chart, offered as its alt text. Pure; the author edits it before using it.
import { fmtCompact, type Row } from '@/charts/builder/compile'
import { MARK_LABEL, type ChartSpec } from '@/charts/builder/spec'

const sumBy = (rows: Row[], key: string, val: string): [string, number][] => {
  const m = new Map<string, number>()
  for (const r of rows) {
    const v = Number(r[val])
    if (Number.isFinite(v)) m.set(String(r[key]), (m.get(String(r[key])) ?? 0) + v)
  }
  return [...m.entries()]
}
const isNum = (rows: Row[], f: string) => rows.some((r) => r[f] !== null && r[f] !== undefined) && rows.every((r) => r[f] === null || r[f] === undefined || typeof r[f] === 'number')
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** One or two sentences naming what is plotted and what stands out; empty when there is not enough on the shelves to say. */
export function describeChart(spec: ChartSpec, rows: Row[]): string {
  const f = (ch: keyof ChartSpec['enc']) => spec.enc[ch]?.f
  const x = f('x'), y = f('y'), color = f('color'), size = f('size')
  const kind = MARK_LABEL[spec.mark].toLowerCase()
  const title = spec.text.title.t.trim()
  const lead = title ? `${title.replace(/[.\s]+$/, '')}. ` : ''
  const by = color && color !== x && color !== y ? `, split by ${color}` : ''
  let body = ''

  if (spec.mark === 'bar' && x && y) {
    const valF = isNum(rows, y) && !isNum(rows, x) ? y : isNum(rows, x) && !isNum(rows, y) ? x : y
    const catF = valF === y ? x : y
    body = `A ${kind} chart of ${valF} by ${catF}${by}.`
    const totals = sumBy(rows, catF, valF).sort((a, b) => b[1] - a[1])
    if (totals.length >= 2) body += ` ${totals[0][0]} is highest at ${fmtCompact(totals[0][1])} and ${totals[totals.length - 1][0]} is lowest at ${fmtCompact(totals[totals.length - 1][1])}.`
  } else if ((spec.mark === 'line' || spec.mark === 'area') && x && y) {
    body = `A ${kind} chart of ${y} over ${x}${by}.`
    const names = color ? [...new Set(rows.map((r) => String(r[color])))] : []
    if (names.length > 1 && names.length <= 6) body += ` It shows ${list(names)}.`
    const peak = sumBy(rows, x, y).sort((a, b) => b[1] - a[1])[0]
    if (peak && !color) body += ` The highest value is ${fmtCompact(peak[1])} at ${peak[0]}.`
  } else if ((spec.mark === 'pie' || spec.mark === 'waffle') && color && size) {
    const parts = sumBy(rows, color, size).sort((a, b) => b[1] - a[1])
    const total = parts.reduce((a, p) => a + p[1], 0)
    body = `A ${kind} chart of ${size} by ${color}.`
    if (parts.length >= 2 && total > 0) body += ` ${parts[0][0]} is the largest share at ${Math.round((parts[0][1] / total) * 100)}%.`
  } else if (spec.mark === 'scatter' && x && y) {
    body = `A scatter plot of ${y} against ${x}${by}, with ${rows.length} points.`
  } else if (spec.mark === 'histogram' && x) {
    body = `A histogram of ${x}${by}.`
  } else {
    const fields = [...new Set(Object.values(spec.enc).map((e) => e!.f))]
    if (!fields.length) return ''
    body = `A ${kind} chart using ${list(fields)}.`
  }
  return (lead + body).slice(0, 320)
}
