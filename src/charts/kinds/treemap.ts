// Treemap (project-docs/redesign/04-chart-catalogue.md section 6). D3 squarified treemap of a group > leaf hierarchy:
// trips by purpose x mode, households by income x vehicles, VMT by county x road type. In Change / % change with the
// `diff` strategy the geometry stays the focus scenario's and the fill is the diverging colour of its % change against
// the reference cell.
import { hierarchy, treemap, type HierarchyRectangularNode } from 'd3-hierarchy'
import { select } from 'd3-selection'

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

    const root = hierarchy<Node>({ name: 'all', children: spec.groups as Node[] })
      .sum((d) => d.v ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    treemap<Node>()
      .size([w, h])
      .paddingInner(3)
      .paddingTop((d) => (d.depth === 1 ? 22 : 0))
      .round(true)(root)

    el.replaceChildren()
    const s = select(el)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .style('display', 'block')
      .style('overflow', 'visible')
      .style('font-family', t.font)
      .style('font-size', '12px')

    const groups = (root.children ?? []) as HierarchyRectangularNode<Node>[]
    const gw = (d: { x0: number; x1: number }) => d.x1 - d.x0
    s.append('g')
      .selectAll('text')
      .data(groups)
      .join('text')
      .attr('x', (d) => d.x0 + 1)
      .attr('y', (d) => d.y0 + 14)
      .attr('fill', t.ink)
      .attr('font-weight', 600)
      .style('pointer-events', 'none')
      .text((d) => (showGroupName(gw(d)) ? d.data.name : ''))
      .append('tspan')
      .attr('fill', t.mute)
      .attr('font-weight', 400)
      .text((d) => (showGroupTotal(gw(d)) ? `  ${spec.fmt(d.value ?? 0)}` : ''))

    const delta = (g: string, n: string, v: number) => (ref ? fmtPctChange(changeFraction(v, ref.values.get(`${g}|${n}`))) : '')
    const leaves = root.leaves() as HierarchyRectangularNode<Node>[]
    const leaf = s
      .append('g')
      .selectAll('g')
      .data(leaves)
      .join('g')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
      .attr('data-key', (d) => `${d.parent!.data.name}|${d.data.name}`)
      .attr('data-title', (d) => `${d.parent!.data.name} · ${d.data.name}`)
      .attr('data-val', (d) => spec.fmt(d.value ?? 0))
      .attr('data-num', (d) => d.value ?? 0)
      .attr('data-rel', '1')
    if (spec.isMode) leaf.attr('data-m', (d) => d.data.name)

    leaf
      .append('rect')
      .attr('width', (d) => Math.max(0, gw(d)))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('rx', 6)
      .attr('fill', (d) => fill(d.data.name, d.parent!.data.name, d.value ?? 0))

    leaf
      .filter((d) => showLeafLabel(gw(d), d.y1 - d.y0))
      .append('text')
      .attr('x', 9)
      .attr('y', 20)
      .attr('fill', (d) => t.onColor(fill(d.data.name, d.parent!.data.name, d.value ?? 0)))
      .attr('font-weight', 600)
      .attr('stroke', 'none') // the synced-hover outline is set on the group: text must not inherit it
      .style('pointer-events', 'none')
      .text((d) => d.data.name)
      .append('tspan')
      .attr('x', 9)
      .attr('dy', 16)
      .attr('font-weight', 400)
      .attr('opacity', 0.85)
      .text((d) => `${spec.fmt(d.value ?? 0)}${ref ? `  ${delta(d.parent!.data.name, d.data.name, d.value ?? 0)}` : ''}`)

    leaf
      .on('mousemove', (e: MouseEvent, d) => {
        const g = d.parent!.data.name
        const v = d.value ?? 0
        const rows = [
          { k: 'Total', v: `${spec.fmt(v)} ${spec.ofLabel}`, b: true, c: fill(d.data.name, g, v) },
          { k: `Share of ${g.toLowerCase()}`, v: `${f1(shareOfGroup(v, d.parent!.value ?? 0))}%` },
        ]
        if (ref) rows.push({ k: 'Change vs reference', v: delta(g, d.data.name, v), })
        tooltip.show({ title: `${g} · ${d.data.name}`, rows }, e)
      })
      .on('mouseleave', () => tooltip.hide())

    if (spec.isMode) wireModeHover(el)

    const unitNote = ref ? `, coloured by change from ${ref.label}` : ''
    return {
      legend: model.legend,
      label: `Treemap of ${spec.unit} for ${env.focus?.label ?? env.scenarios[0]?.label ?? ''}${unitNote}`,
    }
  },
}

export default kind
