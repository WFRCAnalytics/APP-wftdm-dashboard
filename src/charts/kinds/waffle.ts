// Auto ownership, Waffle (project-docs/redesign/04-chart-catalogue.md section 17). A 10x10 grid of rounded squares, one
// per percent of households, filled bottom-up in category order with largest-remainder rounding.
import { select, type Selection } from 'd3-selection'

import { AUTOS } from '@/charts/vocab'
import { f1, num, str } from '@/charts/util'
import { largestRemainder, waffleCells, waffleLayout, waffleSlot } from '@/charts/lib/waffle'
import type { ChartKind } from '@/charts/types'
import { tooltip } from '@/services/tooltip'

const SVG_NS = 'http://www.w3.org/2000/svg'

const kind: ChartKind = {
  tables: () => ['auto_ownership_summary'],
  draw(el, env) {
    const t = env.theme
    const run = env.focus?.run ?? env.scenarios[0]?.run
    const byAuto = new Map<string, number>()
    for (const r of run ? env.data.rows(run, 'auto_ownership_summary') : []) byAuto.set(str(r, 'auto_ownership'), (byAuto.get(str(r, 'auto_ownership')) ?? 0) + num(r, 'households'))
    const households = [...byAuto.values()].reduce((a, b) => a + b, 0)
    if (households <= 0) {
      el.replaceChildren()
      const p = document.createElement('p')
      p.textContent = 'No auto ownership data for this scenario.'
      p.className = 'p-5 font-body text-sm text-[var(--mute)]'
      el.append(p)
      return { label: 'Auto ownership: no data' }
    }

    const w = env.width
    const h = env.height
    const share = AUTOS.map((a) => ((byAuto.get(a) ?? 0) / households) * 100)
    const counts = largestRemainder(share, 100)
    const cells = waffleCells(counts)
    const cols = t.ramp(t.tokens.c2, AUTOS.length, 0.8)
    const lay = waffleLayout(w, h)
    const pinned = env.pinned
    const hhLabel = `${Math.round(households / 1000)}k`

    const svg = document.createElementNS(SVG_NS, 'svg')
    el.replaceChildren(svg)
    const root = select(svg).attr('width', w).attr('height', h).style('display', 'block').style('overflow', 'visible').style('font-family', t.font).style('font-size', `${t.fs}px`)
    const gg = root.append('g').attr('transform', `translate(${lay.ox},${lay.oy})`)
    const rect = gg
      .selectAll<SVGRectElement, number>('rect')
      .data(cells)
      .join('rect')
      .attr('x', (_d, i) => waffleSlot(i).col * lay.cs + 1.5)
      .attr('y', (_d, i) => waffleSlot(i).row * lay.cs + 1.5)
      .attr('width', Math.max(1, lay.cs - 3))
      .attr('height', Math.max(1, lay.cs - 3))
      .attr('rx', Math.max(2, lay.cs * 0.2))
      .attr('fill', (d) => cols[d])
    // Every square carries its key. Side by side (05 section 4) the grid owns hover, highlight and the one synced tooltip;
    // on its own the tile draws the same highlight itself (the `wf-hl` rules in chartInteraction.css: the hovered group at
    // full strength, the rest faded), so hover looks the same with Compare on or off.
    rect.attr('data-key', (d) => AUTOS[d])
    if (pinned) {
      rect
        .attr('data-title', (d) => AUTOS[d])
        .attr('data-val', (d) => `${f1(share[d])}%`)
        .attr('data-num', (d) => share[d])
        .attr('data-unit', ' pts')
    } else {
      root.classed('wf-hl', true)
    }

    const hl = (j: number | null) => {
      if (pinned) return
      root.classed('syncing', j !== null)
      rect.classed('sync', (d) => j !== null && d === j)
      legendRows?.attr('opacity', (j2) => (j === null || j2 === j ? 1 : 0.4))
    }
    let legendRows: Selection<SVGGElement, number, SVGGElement, unknown> | undefined

    if (!pinned) {
      rect
        .on('mouseenter', (_e, d) => hl(d))
        .on('mouseleave', () => {
          hl(null)
          tooltip.hide()
        })
        .on('mousemove', (e: MouseEvent, d) =>
          tooltip.show(
            {
              title: AUTOS[d],
              rows: [
                { k: 'Households', v: `${f1(share[d])}%`, b: true, c: cols[d] },
                { k: 'Count', v: `${Math.round(((byAuto.get(AUTOS[d]) ?? 0) / 1000))}k` },
              ],
            },
            e,
          ),
        )
    }

    if (lay.legend) {
      const x0 = lay.size + 40
      const rh = Math.min(40, (h - 20) / 5)
      const y0 = (h - rh * 5) / 2
      const L = root.append('g').attr('transform', `translate(${x0},${y0})`)
      legendRows = L.selectAll<SVGGElement, number>('g')
        .data(AUTOS.map((_a, j) => j))
        .join('g')
        .attr('transform', (j) => `translate(0,${j * rh})`)
        .style('cursor', 'default')
      legendRows.append('rect').attr('width', 14).attr('height', 14).attr('y', rh / 2 - 7).attr('rx', 4).attr('fill', (j) => cols[j])
      legendRows.append('text').attr('x', 24).attr('y', rh / 2).attr('dy', '.35em').attr('fill', t.ink).text((j) => AUTOS[j])
      legendRows
        .append('text')
        .attr('x', Math.min(260, w - x0 - 4))
        .attr('y', rh / 2)
        .attr('dy', '.35em')
        .attr('text-anchor', 'end')
        .attr('fill', t.ink)
        .attr('font-weight', 600)
        .text((j) => `${f1(share[j])}%`)
      if (!pinned) legendRows.on('mouseenter', (_e, j) => hl(j)).on('mouseleave', () => hl(null))
      root
        .append('text')
        .attr('x', x0)
        .attr('y', y0 - 10)
        .attr('fill', t.mute)
        .attr('font-size', t.fs)
        .text(`Each square is 1% of ${hhLabel} households`)
    }

    svg.setAttribute('role', 'img')
    return { label: `Households by number of cars, ${env.focus?.label ?? ''} ${env.year}: ${AUTOS.map((a, j) => `${a} ${f1(share[j])}%`).join(', ')}` }
  },
}

export default kind
