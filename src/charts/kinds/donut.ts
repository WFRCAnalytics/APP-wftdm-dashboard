// Donut with a ranked list (catalogue section 5): D3 pie/arc. The centre reads the total ("9.81M daily trips") and swaps
// to the hovered mode; beside it (body wider than 420 px) a ranked list with each mode's gap to observed. In Change mode
// the donut is replaced by the mode-share bars of differences for the focus scenario.
import { select } from 'd3-selection'
import { arc as d3arc, pie as d3pie } from 'd3-shape'

import { MODES } from '@/charts/vocab'
import { emptyNote, f1, sgn } from '@/charts/util'
import { fmtMillions, gapStatus, modeShare, rankModes, statusColors, totalTrips } from '@/charts/lib/modeShare'
import { drawModeBars } from '@/charts/kinds/modeBars'
import type { ChartKind } from '@/charts/types'
import { wireModeHover } from '@/panels/crossHighlight'

const kind: ChartKind = {
  tables: () => ['trip_mode_share'],
  // the gap column compares with Observed, which is not a compared run
  extraRuns: (plan) => (plan.observedRun ? [plan.observedRun] : []),
  draw(el, env) {
    if (env.display !== 'val') {
      const focus = env.focus ?? env.scenarios[0]
      return drawModeBars(el, { ...env, scenarios: focus ? [focus] : [], group: 'scn' })
    }
    const { theme: t, width: w, height: h } = env
    const focus = env.focus ?? env.scenarios[0]
    if (!focus) {
      emptyNote(el, 'No scenario to show.')
      return
    }
    const vals = modeShare(env, focus.run)
    const total = totalTrips(env, focus.run)
    const cmpRun = env.observedRun ?? env.refRunFor(focus.run)
    const cmp = cmpRun && cmpRun !== focus.run ? modeShare(env, cmpRun) : null
    const cmpName = env.observedRun ? 'observed' : env.reference.label.toLowerCase()
    const status = statusColors(el)

    el.replaceChildren()
    const svg = select(el)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .style('display', 'block')
      .style('overflow', 'visible')
      .style('font-family', t.font)
      .style('font-size', '12px')
    const wide = w > 420
    const size = Math.min(h, w * (wide ? 0.5 : 1))
    const R = size / 2 - 4
    const cx = wide ? size / 2 + 4 : w / 2
    const cy = h / 2
    const gg = svg.append('g').attr('transform', `translate(${cx},${cy})`)
    const slices = d3pie<number>().sort(null).value((d) => d)(vals)
    const arcGen = d3arc<(typeof slices)[number]>().innerRadius(R * 0.64).outerRadius(R).padAngle(0.012).cornerRadius(5)
    const idle = { big: fmtMillions(total), sub: 'daily trips' }
    const big = gg.append('text').attr('text-anchor', 'middle').attr('y', 2).attr('font-size', R * 0.3).attr('font-weight', 600).attr('fill', t.ink).text(idle.big)
    const sub = gg.append('text').attr('text-anchor', 'middle').attr('y', R * 0.22 + 6).attr('fill', t.mute).text(idle.sub)
    const show = (i: number | null) => {
      big.text(i === null ? idle.big : `${f1(vals[i])}%`)
      sub.text(i === null ? idle.sub : MODES[i])
    }
    gg.selectAll('path')
      .data(slices)
      .join('path')
      .attr('d', (d) => arcGen(d) ?? '')
      .attr('fill', (_d, i) => t.mode(MODES[i]))
      .attr('data-m', (_d, i) => MODES[i])
      .on('mouseenter', (_e, d) => show(d.index))
      .on('mouseleave', () => show(null))

    if (wide) {
      const x0 = size + 40
      const rowH = Math.min(34, (h - 12) / 6)
      const list = svg.append('g').attr('transform', `translate(${x0},${(h - rowH * 6) / 2})`)
      rankModes(vals).forEach((i, r) => {
        const row = list.append('g').attr('transform', `translate(0,${r * rowH})`).attr('data-m', MODES[i]).style('cursor', 'default')
        row.append('circle').attr('cx', 6).attr('cy', rowH / 2).attr('r', 6).attr('fill', t.mode(MODES[i]))
        row.append('text').attr('x', 20).attr('y', rowH / 2).attr('dy', '.35em').attr('fill', t.ink).text(MODES[i])
        row
          .append('text')
          .attr('x', w - x0 - 62)
          .attr('y', rowH / 2)
          .attr('dy', '.35em')
          .attr('text-anchor', 'end')
          .attr('fill', t.ink)
          .attr('font-weight', 600)
          .text(`${f1(vals[i])}%`)
        if (cmp) {
          const gap = vals[i] - cmp[i]
          row
            .append('text')
            .attr('x', w - x0 - 4)
            .attr('y', rowH / 2)
            .attr('dy', '.35em')
            .attr('text-anchor', 'end')
            .attr('fill', status[gapStatus(gap)])
            .text(`${sgn(gap) || (gap < 0 ? '−' : '+')}${Math.abs(gap).toFixed(1)}`)
        }
      })
      if (cmp) {
        list
          .append('text')
          .attr('x', w - x0 - 4)
          .attr('y', -6)
          .attr('text-anchor', 'end')
          .attr('fill', t.mute)
          .attr('font-size', 11)
          .text(`vs ${cmpName}, pts`)
      }
    }

    const node = svg.node() as SVGSVGElement
    wireModeHover(node)
    return { label: `Mode share donut for ${focus.label}, ${env.year}: ${MODES.map((m, i) => `${m} ${f1(vals[i])}%`).join(', ')}` }
  },
}

export default kind
