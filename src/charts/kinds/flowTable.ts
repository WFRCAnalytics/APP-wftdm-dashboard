// District flows, Table view (project-docs/redesign/04-chart-catalogue.md section 14): the full origin x destination
// matrix, intra-district trips included, in thousands of daily trips. The non-visual path to the Chord's numbers.
import { districtMatrix, fmtFlowCell } from '@/charts/lib/flows'
import { h, NUM, TBL, TD, TH } from '@/charts/lib/htmlTable'
import type { ChartKind } from '@/charts/types'
import { emptyNote } from '@/charts/util'
import { DISTRICTS } from '@/charts/vocab'

const kind: ChartKind = {
  tables: () => ['od_district'],
  draw(el, env) {
    const run = env.pinned ? env.scenarios[0]?.run : (env.focus?.run ?? env.scenarios[0]?.run)
    const m = run ? districtMatrix(env.data.rows(run, 'od_district')) : null
    if (!m || m.every((r) => r.every((v) => v <= 0))) {
      emptyNote(el, `No district flows for ${env.focus?.label ?? 'this scenario'} in ${env.year}.`)
      return { label: `${env.config.title}: no data` }
    }
    const thead = h('thead', {}, h('tr', {}, h('th', { style: TH }, 'From \\ to'), ...DISTRICTS.map((d) => h('th', { style: `${TH};text-align:right` }, d))))
    const tbody = h(
      'tbody',
      {},
      ...DISTRICTS.map((name, i) => h('tr', {}, h('td', { style: TD }, name), ...m[i].map((v) => h('td', { style: `${TD};${NUM}` }, fmtFlowCell(v))))),
    )
    const wrap = h('div', { style: 'overflow:auto;height:100%;color:var(--ink)' }, h('table', { style: TBL }, thead, tbody))
    el.replaceChildren(wrap)
    el.setAttribute('role', 'group')
    return { label: `District flow matrix of daily trips in thousands, ${env.focus?.label ?? env.scenarios[0]?.label ?? ''}, ${env.year}` }
  },
}

export default kind
