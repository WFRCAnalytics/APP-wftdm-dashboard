// Mode share, Table (catalogue section 1 non-visual path; prototype modeTbl/htmlTable): the same numbers as the bars and
// their tooltip. Reference column first, then each compared scenario as "61.2% +1.2" (Values) or "+1.2 pts" (Change).
import { MODES } from '@/charts/vocab'
import { emptyNote, f1, sgn } from '@/charts/util'
import { gapStatus, modeShare, statusColors, tableCell, type TableCell } from '@/charts/lib/modeShare'
import type { ChartKind } from '@/charts/types'
import { formatDelta } from '@/panels/compareMath'

const kind: ChartKind = {
  tables: () => ['trip_mode_share'],
  draw(el, env) {
    const m = env.display
    const selfBase = env.reference.kind === 'self-base-year'
    const refRun = selfBase ? undefined : env.reference.run
    const scenarios = env.scenarios.filter((s) => s.run !== refRun)
    if (scenarios.length === 0 && !refRun) {
      emptyNote(el, 'Choose a scenario to compare.')
      return { label: `${env.config.title ?? 'Mode share'} table: no data` }
    }
    const status = statusColors(el)
    const observed = env.reference.isObserved

    const cols = scenarios.map((s) => ({ label: s.label, color: s.color, share: modeShare(env, s.run), ref: selfBase || refRun ? modeShare(env, env.refRunFor(s.run)) : null }))
    const refShare = refRun ? modeShare(env, refRun) : null

    const cell = (c: TableCell, ref: number | null): HTMLElement => {
      const td = document.createElement('td')
      td.style.cssText = 'padding:8px;border-bottom:1px solid var(--grid);text-align:right;font:13px var(--font-mono);white-space:nowrap'
      if (ref === null) {
        td.textContent = `${f1(c.val)}%`
        return td
      }
      const main = document.createElement('span')
      const side = document.createElement('span')
      side.style.marginLeft = '6px'
      if (m === 'val') {
        main.textContent = `${f1(c.val)}%`
        side.textContent = c.gap === null ? '' : `${sgn(c.gap) || (c.gap < 0 ? '−' : '+')}${Math.abs(c.gap).toFixed(1)}`
        side.style.color = observed && c.gap !== null ? status[gapStatus(c.gap)] : 'var(--mute)'
      } else {
        main.textContent = c.main === null ? 'n/a' : `${formatDelta(c.main, m)}${m === 'abs' ? ' pts' : ''}`
        side.textContent = `${f1(c.val)}%`
        side.style.color = 'var(--mute)'
      }
      td.append(main, side)
      return td
    }

    const wrap = document.createElement('div')
    wrap.style.cssText = 'overflow:auto;height:100%'
    const table = document.createElement('table')
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px'
    table.setAttribute('aria-label', `Mode share by scenario, ${env.year}`)
    const head = document.createElement('tr')
    const heads: { text: string; color?: string; num: boolean }[] = [
      { text: 'Mode', num: false },
      ...(refShare ? [{ text: observed ? 'Observed' : `Reference: ${env.reference.label}`, num: true }] : []),
      ...cols.map((c) => ({ text: c.label, color: c.color, num: true })),
    ]
    for (const h of heads) {
      const th = document.createElement('th')
      th.scope = 'col'
      th.style.cssText = `font-weight:500;color:var(--mute);text-align:${h.num ? 'right' : 'left'};font-size:12.5px;padding:6px 8px;border-bottom:1px solid var(--line)`
      if (h.color) {
        const dot = document.createElement('i')
        dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${h.color}`
        th.append(dot)
      }
      th.append(h.text)
      head.append(th)
    }
    const thead = document.createElement('thead')
    thead.append(head)
    const tbody = document.createElement('tbody')
    MODES.forEach((mode, j) => {
      const tr = document.createElement('tr')
      const th = document.createElement('th')
      th.scope = 'row'
      th.textContent = mode
      th.style.cssText = 'padding:8px;border-bottom:1px solid var(--grid);text-align:left;font-weight:400;color:var(--ink)'
      tr.append(th)
      if (refShare) tr.append(cell({ val: refShare[j], main: refShare[j], gap: null }, null))
      for (const c of cols) tr.append(cell(tableCell(c.share[j], c.ref ? c.ref[j] : null, m), c.ref ? c.ref[j] : null))
      tbody.append(tr)
    })
    table.append(thead, tbody)
    wrap.append(table)
    el.replaceChildren(wrap)
    return { label: `Mode share table, ${env.year}` }
  },
}

export default kind
