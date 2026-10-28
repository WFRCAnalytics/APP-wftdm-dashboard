// Treemap (project-docs/redesign/04-chart-catalogue.md section 6). D3 squarified treemap of a group > leaf hierarchy:
// trips by purpose x mode, households by income x vehicles, VMT by county x road type. In Change / % change with the
// `diff` strategy the geometry stays the focus scenario's and the fill is the diverging colour of its % change against
// the reference cell. Click a group (its name or any tile in it) to zoom into it; click its header to go back.
import { hierarchy, treemap, type HierarchyRectangularNode } from 'd3-hierarchy'
import { select } from 'd3-selection'
import 'd3-transition'

import {
  buildHierModel,
  changeFraction,
  fmtPctChange,
  hierTable,
  shareOfGroup,
  showGroupName,
  showGroupTotal,
  showLeafLabel,
  variantOf,
} from '@/charts/lib/hierarchy'
import type { ChartKind } from '@/charts/types'
import { emptyNote, f1 } from '@/charts/util'
import { wireModeHover } from '@/panels/crossHighlight'
import { tooltip } from '@/services/tooltip'

interface Node {
  name: string
  v?: number
  idx?: number
  children?: Node[]
}
/** A tile's box, kept between renders so a zoom can tween every tile from where it was. */
interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const TWEEN_MS = 380

const kind: ChartKind = {
  tables: (plan) => {
    const variant = variantOf(plan.config.variant)
    return [hierTable(variant, plan.group)]
  },
  draw(el, env) {
    const model = buildHierModel(env, true, el)
    if (!model) {
      emptyNote(el, `No data for ${env.focus?.label ?? 'this scenario'} in ${env.year}.`)
      return { label: `${env.config.title}: no data` }
    }
    const { spec, ref, fill } = model
    const t = env.theme
    const w = env.width
    const h = env.height

    const st = env.state as { scope?: string | null; prev?: Map<string, Box> }
    if (st.scope && !spec.groups.some((g) => g.name === st.scope)) st.scope = null
    // a redraw (resize, theme, data) must not animate: only a click does
    st.prev = undefined

    el.replaceChildren()
    const svg = select(el)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .style('display', 'block')
      .style('overflow', 'visible')
      .style('font-family', t.font)
      .style('font-size', '12px')
    const body = svg.append('g')

    const gw = (d: { x0: number; x1: number }) => d.x1 - d.x0
    const delta = (g: string, n: string, v: number) => (ref ? fmtPctChange(changeFraction(v, ref.values.get(`${g}|${n}`))) : '')

    function render(animate: boolean): void {
      const scope = st.scope ?? null
      tooltip.hide()
      const kids = (scope === null ? spec.groups : (spec.groups.find((g) => g.name === scope)?.children ?? [])) as Node[]
      const root = hierarchy<Node>({ name: scope ?? 'all', children: kids })
        .sum((d) => d.v ?? 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      treemap<Node>()
        .size([w, h])
        .paddingInner(3)
        .paddingTop((d) => (scope === null ? (d.depth === 1 ? 22 : 0) : d.depth === 0 ? 22 : 0))
        .round(true)(root)
      const groupName = (d: HierarchyRectangularNode<Node>) => (scope === null ? d.parent!.data.name : scope)
      const keyOf = (d: HierarchyRectangularNode<Node>) => `${groupName(d)}|${d.data.name}`
      const leaves = root.leaves() as HierarchyRectangularNode<Node>[]
      const prev = st.prev
      st.prev = new Map(leaves.map((d) => [keyOf(d), { x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1 }]))

      body.selectAll('*').remove()
      const zoomTo = (name: string | null) => {
        st.scope = name
        render(true)
      }

      const header = body.append('g')
      if (scope === null) {
        header
          .selectAll('text')
          .data((root.children ?? []) as HierarchyRectangularNode<Node>[])
          .join('text')
          .attr('x', (d) => d.x0 + 1)
          .attr('y', (d) => d.y0 + 14)
          .attr('fill', t.ink)
          .attr('font-weight', 600)
          .style('cursor', 'zoom-in')
          .on('click', (_e: MouseEvent, d) => zoomTo(d.data.name))
          .text((d) => (showGroupName(gw(d)) ? d.data.name : ''))
          .append('tspan')
          .attr('fill', t.mute)
          .attr('font-weight', 400)
          .text((d) => (showGroupTotal(gw(d)) ? `  ${spec.fmt(d.value ?? 0)}` : ''))
      } else {
        header
          .append('text')
          .attr('x', 1)
          .attr('y', 14)
          .attr('fill', t.ink)
          .attr('font-weight', 600)
          .style('cursor', 'zoom-out')
          .on('click', () => zoomTo(null))
          .text(`‹ ${scope}`)
          .append('tspan')
          .attr('fill', t.mute)
          .attr('font-weight', 400)
          .text(`  ${spec.fmt(root.value ?? 0)} · click to go back`)
      }

      const leaf = body
        .append('g')
        .selectAll<SVGGElement, HierarchyRectangularNode<Node>>('g')
        .data(leaves)
        .join('g')
        .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
        .attr('data-key', keyOf)
        .attr('data-title', (d) => `${groupName(d)} · ${d.data.name}`)
        .attr('data-val', (d) => spec.fmt(d.value ?? 0))
        .attr('data-num', (d) => d.value ?? 0)
        .attr('data-rel', '1')
        .style('cursor', scope === null ? 'zoom-in' : 'default')
      if (spec.isMode) leaf.attr('data-m', (d) => d.data.name)

      leaf
        .append('rect')
        .attr('width', (d) => Math.max(0, gw(d)))
        .attr('height', (d) => Math.max(0, d.y1 - d.y0))
        .attr('rx', 6)
        .attr('fill', (d) => fill(d.data.name, groupName(d), d.value ?? 0))

      const labels = leaf
        .filter((d) => showLeafLabel(gw(d), d.y1 - d.y0))
        .append('text')
        .attr('x', 9)
        .attr('y', 20)
        .attr('fill', (d) => t.onColor(fill(d.data.name, groupName(d), d.value ?? 0)))
        .attr('font-weight', 600)
        .attr('stroke', 'none') // the synced-hover outline is set on the group: text must not inherit it
        .style('pointer-events', 'none')
        .text((d) => d.data.name)
      labels
        .append('tspan')
        .attr('x', 9)
        .attr('dy', 16)
        .attr('font-weight', 400)
        .attr('opacity', 0.85)
        .text((d) => `${spec.fmt(d.value ?? 0)}${ref ? `  ${delta(groupName(d), d.data.name, d.value ?? 0)}` : ''}`)

      if (animate && prev) {
        // tiles slide from their old box to the new one; labels fade in once they have landed
        labels.attr('opacity', 0)
        leaf
          .transition()
          .duration(TWEEN_MS)
          .tween('box', function (d) {
            const from = prev.get(keyOf(d)) ?? { x0: d.x0, y0: d.y0, x1: d.x0, y1: d.y0 }
            const g = this as SVGGElement
            const r = g.firstChild as SVGRectElement
            const mix = (a: number, b: number, u: number) => a + (b - a) * u
            return (u: number) => {
              g.setAttribute('transform', `translate(${mix(from.x0, d.x0, u)},${mix(from.y0, d.y0, u)})`)
              r.setAttribute('width', String(Math.max(0, mix(from.x1 - from.x0, gw(d), u))))
              r.setAttribute('height', String(Math.max(0, mix(from.y1 - from.y0, d.y1 - d.y0, u))))
            }
          })
        labels.transition().delay(TWEEN_MS * 0.7).duration(160).attr('opacity', 1)
      }

      leaf
        .on('click', (_e: MouseEvent, d) => {
          if (scope === null) zoomTo(d.parent!.data.name)
        })
        .on('mousemove', (e: MouseEvent, d) => {
          const g = groupName(d)
          const v = d.value ?? 0
          const rows = [
            { k: 'Total', v: `${spec.fmt(v)} ${spec.ofLabel}`, b: true, c: fill(d.data.name, g, v) },
            { k: `Share of ${g.toLowerCase()}`, v: `${f1(shareOfGroup(v, scope === null ? (d.parent!.value ?? 0) : (root.value ?? 0)))}%` },
          ]
          if (ref) rows.push({ k: 'Change vs reference', v: delta(g, d.data.name, v) })
          tooltip.show({ title: `${g} · ${d.data.name}`, rows, foot: scope === null ? 'Click to zoom in' : undefined }, e)
        })
        .on('mouseleave', () => tooltip.hide())

      if (spec.isMode) wireModeHover(el)
    }
    render(false)

    const unitNote = ref ? `, coloured by change from ${ref.label}` : ''
    return {
      legend: model.legend,
      label: `Treemap of ${spec.unit} for ${env.focus?.label ?? env.scenarios[0]?.label ?? ''}${unitNote}`,
    }
  },
}

export default kind
