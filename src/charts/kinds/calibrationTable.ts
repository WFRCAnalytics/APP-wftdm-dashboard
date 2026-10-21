// Calibration fingerprint, Table view (prototype `calTbl`): submodel rows, one column per series, each error as a status
// pill. The same numbers as the radar tooltip, for non-visual access.
import { errorsFrom, MAX_SERIES, status, STATUS_LABEL, SUBMODELS } from '@/charts/lib/fingerprint'
import { h, NUM, TBL, TD, TH } from '@/charts/lib/htmlTable'
import type { ChartKind } from '@/charts/types'
import { emptyNote, f1 } from '@/charts/util'

const TABLE = 'calibration_errors'

const kind: ChartKind = {
  tables: () => [TABLE],
  draw(el, env) {
    const series = env.scenarios
      .slice(0, MAX_SERIES)
      .map((s) => ({ s, e: errorsFrom(env.data.rows(s.run, TABLE)) }))
      .filter((x): x is { s: (typeof env.scenarios)[number]; e: number[] } => x.e !== null)
    if (series.length === 0) {
      emptyNote(el, 'No calibration results for this selection.')
      return { label: `${env.config.title}: no calibration results` }
    }
    const sticky = 'position:sticky;top:0;background:var(--tile);z-index:2'
    const head = h('tr', {}, h('th', { style: `${TH};${sticky}` }, 'Submodel'))
    for (const x of series) head.append(h('th', { style: `${TH};${sticky};text-align:right` }, x.s.label))
    const body = h('tbody')
    SUBMODELS.forEach((d, i) => {
      const tr = h('tr', {}, h('td', { style: TD }, d.name, h('div', { style: 'color:var(--mute);font-size:12px' }, d.measure)))
      for (const x of series) {
        const st = status(x.e[i])
        tr.append(
          h(
            'td',
            { style: `${TD};${NUM}` },
            h(
              'span',
              {
                'data-status': st,
                style: `position:relative;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:2px 9px 2px 7px;border-radius:999px;color:var(--${st});background:color-mix(in srgb, var(--${st}) ${st === 'ok' ? 13 : 14}%, transparent)`,
              },
              h('i', { style: 'width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block' }),
              `${f1(x.e[i])}%`,
              h('span', { style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)' }, ` ${STATUS_LABEL[st]}`),
            ),
          ),
        )
      }
      body.append(tr)
    })
    const table = h('table', { style: `${TBL};font-family:${env.theme.font}` }, h('thead', {}, head), body)
    el.replaceChildren(h('div', { style: 'overflow:auto;height:100%' }, table))
    return { label: `Calibration errors by submodel for ${series.map((x) => x.s.label).join(', ')}` }
  },
}

export default kind
