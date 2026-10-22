// Scenario scorecard (project-docs/redesign/04-chart-catalogue.md section 23, 03 section 5.5). An HTML table in the chart
// region: reference row first and bold, mono right-aligned numerals, two-line headers, cells shaded by their % distance
// from the reference (scaled per column), header click or Enter sorts with aria-sort.
import { columnMax, deltaDecimals, kpiValue, METRICS, nextSort, pctDistance, shade, sortRows, type SortState } from '@/charts/lib/metrics'
import { dashSample, dot, h, NUM, TBL, TD, TH } from '@/charts/lib/htmlTable'
import type { ChartKind, ChartScenario } from '@/charts/types'
import { emptyNote } from '@/charts/util'
import { deltaValue, formatDelta } from '@/panels/compareMath'
import { get as getScenario } from '@/state/appState'

const TABLE = 'summary_kpis'

interface Row {
  s: ChartScenario
  /** Per metric: own value and the reference's value for this row. */
  vals: (number | null)[]
  refs: (number | null)[]
}

const kind: ChartKind = {
  tables: () => [TABLE],
  draw(el, env) {
    const { theme: t, display: m } = env
    const self = env.reference.kind === 'self-base-year'
    const refRun = env.reference.run
    const valueOf = (run: string | undefined, mi: number) => (run ? kpiValue(env.data.rows(run, TABLE), METRICS[mi]) : null)

    const compared = env.scenarios.filter((s) => self || s.run !== refRun)
    if (compared.length === 0) {
      emptyNote(el, 'Pick at least one scenario besides the reference to fill the scorecard.')
      return { label: `${env.config.title}: nothing to compare` }
    }
    const rows: Row[] = compared.map((s) => ({
      s,
      vals: METRICS.map((_, mi) => valueOf(s.run, mi)),
      refs: METRICS.map((_, mi) => valueOf(env.refRunFor(s.run), mi)),
    }))
    const cols = METRICS.map((metric, mi) => ({
      metric,
      max: columnMax(rows.map((r) => pctDistance(r.vals[mi], r.refs[mi]))),
    }))

    const sort = (env.state.scorecardSort as SortState | undefined) ?? { key: null, dir: -1 }
    const sorted = sortRows(rows, sort, (r, k) => r.vals[k])

    const wrap = h('div', { style: 'overflow:auto;height:100%;position:relative' })
    const table = h('table', { style: `${TBL};font-family:${t.font}` })
    const headRow = h('tr')
    headRow.append(h('th', { style: `${TH};position:sticky;top:0;background:var(--tile);z-index:2;vertical-align:bottom` }, 'Scenario'))
    cols.forEach((c, i) => {
      const active = sort.key === i
      const th = h(
        'th',
        {
          'aria-sort': active ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none',
          tabindex: 0,
          'data-s': i,
          style: `${TH};text-align:right;position:sticky;top:0;background:var(--tile);z-index:2;vertical-align:bottom;cursor:pointer;color:${active ? 'var(--ink)' : 'var(--mute)'}`,
        },
        c.metric.label,
        h('small', { style: 'display:block;font-weight:400;font-size:11px;color:var(--mute)' }, `${c.metric.unit}${active ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}`),
      )
      const go = () => {
        env.state.scorecardSort = nextSort(sort, i)
        env.state.scorecardFocus = i
        env.redraw()
      }
      th.addEventListener('click', go)
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          go()
        }
      })
      headRow.append(th)
    })
    table.append(h('thead', {}, headRow))

    const body = h('tbody')
    const refLabel = (() => {
      if (self || !refRun) return ''
      return env.scenarios.find((s) => s.run === refRun)?.label ?? getScenario(refRun)?.label ?? getScenario(refRun)?.displayName ?? env.reference.label
    })()
    if (!self && refRun) {
      const sw = env.reference.isObserved ? dashSample() : dot(env.scenarios.find((s) => s.run === refRun)?.color ?? t.mute, 0.7)
      const tr = h('tr', { style: 'background:color-mix(in srgb, var(--ink) 5%, transparent)' })
      tr.append(
        h('td', { style: `${TD};font-weight:600;white-space:nowrap` }, h('span', { style: 'display:inline-flex;align-items:center' }, sw, refLabel, tag('Reference'))),
      )
      cols.forEach((c, mi) => {
        const v = valueOf(refRun, mi)
        tr.append(h('td', { style: `${TD};${NUM};font-weight:700` }, v === null ? 'n/a' : v.toFixed(c.metric.decimals)))
      })
      body.append(tr)
    }
    for (const r of sorted) {
      const tr = h('tr')
      const tg = getScenario(r.s.run)?.tag
      tr.append(h('td', { style: `${TD};white-space:nowrap` }, h('span', { style: 'display:inline-flex;align-items:center' }, dot(r.s.color), r.s.label, tg ? tag(tg) : null)))
      cols.forEach((c, mi) => {
        const v = r.vals[mi]
        const ref = r.refs[mi]
        const { strength, negative } = shade(pctDistance(v, ref), c.max)
        const text =
          v === null
            ? 'n/a'
            : m === 'val'
              ? v.toFixed(c.metric.decimals)
              : formatDelta(deltaValue(v, ref, m), m, { decimals: m === 'pct' ? c.metric.decimals : deltaDecimals(c.metric, m) })
        const bg = strength ? `background:color-mix(in srgb, ${negative ? t.tokens.c2 : t.tokens.c1} ${strength}%, transparent);` : ''
        tr.append(h('td', { style: `${TD};${NUM};${bg}border-radius:6px` }, text))
      })
      body.append(tr)
    }
    table.append(body)
    wrap.append(table)
    el.replaceChildren(wrap)

    const focusKey = env.state.scorecardFocus as number | undefined
    if (focusKey !== undefined) {
      delete env.state.scorecardFocus
      wrap.querySelector<HTMLElement>(`th[data-s="${focusKey}"]`)?.focus({ preventScroll: true })
    }
    const how = m === 'val' ? 'values' : m === 'abs' ? 'changes from the reference' : 'percent changes from the reference'
    return { label: `Scenario scorecard, ${how}, ${rows.length} scenarios, ${env.year}` }
  },
}

function tag(text: string): HTMLElement {
  return h(
    'span',
    { style: 'font-size:11.5px;font-weight:400;color:var(--mute);border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin-left:6px' },
    text,
  )
}

export default kind
