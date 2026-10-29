// Sunburst (project-docs/redesign/04-chart-catalogue.md section 7). Two rings (group, leaf) around a total; click a group
// arc to zoom into it (one ring, tweened), click the centre to go back. Never a difference colour: Change modes keep
// showing values.
import { hierarchy, partition, type HierarchyRectangularNode } from 'd3-hierarchy'
import { select } from 'd3-selection'
import { arc as d3arc } from 'd3-shape'
import 'd3-transition'

import { buildHierModel, hierTable, showArcLabel, shareOfGroup, variantOf } from '@/charts/lib/hierarchy'
import type { ChartKind } from '@/charts/types'
import { emptyNote, f1 } from '@/charts/util'
import { wireModeHover } from '@/panels/crossHighlight'
import { tooltip } from '@/services/tooltip'
import { prettyText } from '@/services/typography'

interface Node {
  name: string
  v?: number
  idx?: number
  children?: Node[]
}
/** One arc: angles and radii, so a zoom can tween every one of them. */
interface Geo {
  a0: number
  a1: number
  ir: number
  or: number
}
interface ArcDatum extends Geo {
  key: string
  node: HierarchyRectangularNode<Node>
}

const TWEEN_MS = 380

const kind: ChartKind = {
  tables: (plan) => [hierTable(variantOf(plan.config.variant), plan.group)],
  draw(el, env) {
    const model = buildHierModel(env, false, el)
    if (!model) {
      emptyNote(el, `No data for ${env.focus?.label ?? 'this scenario'} in ${env.year}.`)
      return { label: `${env.config.title}: no data` }
    }
    const { spec } = model
    const t = env.theme
    const w = env.width
    const h = env.height
    const R = Math.min(w, h) / 2 - 6
    const r0 = R * 0.34

    const st = env.state as { scope?: string | null; prev?: Map<string, Geo> }
    // the zoom is shared by every facet of the tile: zooming one zooms them all
    const zoomCh = env.sync<string | null>('scope')
    const known = (name: string | null | undefined) => (name && spec.groups.some((g) => g.name === name) ? name : null)
    st.scope = known(zoomCh.get())
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
    const gg = svg.append('g').attr('transform', `translate(${w / 2},${h / 2})`)

    const arcGen = d3arc<Geo>()
      .startAngle((d) => d.a0)
      .endAngle((d) => d.a1)
      .padAngle(0.012)
      .padRadius(R / 2)
      .cornerRadius(4)
      .innerRadius((d) => d.ir)
      .outerRadius((d) => d.or)

    function render(animate: boolean): void {
      const scope = st.scope ?? null
      tooltip.hide()
      const kids = scope === null ? spec.groups : (spec.groups.find((g) => g.name === scope)?.children ?? [])
      const root = hierarchy<Node>({ name: 'all', children: kids as Node[] }).sum((d) => d.v ?? 0)
      partition<Node>().size([2 * Math.PI, 1])(root)
      const rings = scope === null ? 2 : 1
      const ring = (R - r0) / rings
      const nodes = (root.descendants() as HierarchyRectangularNode<Node>[]).filter((d) => d.depth > 0)
      const groupOf = (d: HierarchyRectangularNode<Node>) => (d.children ? d.data.name : d.parent!.data.name === 'all' ? (scope ?? '') : d.parent!.data.name)
      const keyOf = (d: HierarchyRectangularNode<Node>) => (d.children ? `grp|${d.data.name}` : `${groupOf(d)}|${d.data.name}`)
      const data: ArcDatum[] = nodes.map((d) => ({
        key: keyOf(d),
        node: d,
        a0: d.x0,
        a1: d.x1,
        ir: r0 + (d.depth - 1) * ring + (d.depth > 1 ? 2 : 0),
        or: r0 + d.depth * ring - 2,
      }))
      const prev = st.prev
      st.prev = new Map(data.map((d) => [d.key, { a0: d.a0, a1: d.a1, ir: d.ir, or: d.or }]))

      gg.selectAll('*').remove()
      const fill = (d: ArcDatum) => (d.node.children ? t.neutral(d.node.data.idx ?? 0) : spec.leaf(d.node.data.name, groupOf(d.node)))
      const paths = gg
        .append('g')
        .selectAll<SVGPathElement, ArcDatum>('path')
        .data(data)
        .join('path')
        .attr('d', (d) => arcGen(d))
        .attr('fill', fill)
        .attr('data-key', (d) => d.key)
        .attr('data-title', (d) => (d.node.children ? d.node.data.name : `${groupOf(d.node)} · ${d.node.data.name}`))
        .attr('data-val', (d) => spec.fmt(d.node.value ?? 0))
        .attr('data-num', (d) => d.node.value ?? 0)
        .attr('data-rel', '1')
        .style('cursor', (d) => (d.node.children ? 'zoom-in' : 'default'))
      if (spec.isMode) paths.filter((d) => !d.node.children).attr('data-m', (d) => d.node.data.name)

      if (animate && prev) {
        paths
          .transition()
          .duration(TWEEN_MS)
          .attrTween('d', (d) => {
            const from = prev.get(d.key) ?? { a0: d.a0, a1: d.a0, ir: d.ir, or: d.ir }
            return (u: number) =>
              arcGen({
                a0: from.a0 + (d.a0 - from.a0) * u,
                a1: from.a1 + (d.a1 - from.a1) * u,
                ir: from.ir + (d.ir - from.ir) * u,
                or: from.or + (d.or - from.or) * u,
              }) ?? ''
          })
      }

      paths
        .on('click', (_e: MouseEvent, d) => {
          if (d.node.children) zoomCh.set(d.node.data.name)
        })
        .on('mousemove', (e: MouseEvent, d) => {
          const v = d.node.value ?? 0
          if (d.node.children) {
            tooltip.show(
              { title: d.node.data.name, rows: [{ k: 'Total', v: `${spec.fmt(v)} ${spec.ofLabel}`, b: true, c: t.neutral(d.node.data.idx ?? 0) }], foot: 'Click to zoom in' },
              e,
            )
            return
          }
          const g = groupOf(d.node)
          tooltip.show(
            {
              title: `${g} · ${d.node.data.name}`,
              rows: [
                { k: 'Total', v: `${spec.fmt(v)} ${spec.ofLabel}`, b: true, c: spec.leaf(d.node.data.name, g) },
                { k: `Share of ${g.toLowerCase()}`, v: `${f1(shareOfGroup(v, d.node.parent?.value ?? 0))}%` },
              ],
            },
            e,
          )
        })
        .on('mouseleave', () => tooltip.hide())

      const labels = gg
        .append('g')
        .selectAll('text')
        .data(data.filter((d) => d.node.children && showArcLabel(d.a1 - d.a0)))
        .join('text')
        .style('pointer-events', 'none')
        .attr('text-anchor', 'middle')
        .attr('dy', '.35em')
        .attr('fill', t.ink)
        .attr('font-weight', 600)
        .attr('transform', (d) => {
          const a = (((d.a0 + d.a1) / 2) * 180) / Math.PI - 90
          const r = r0 + ring * 0.5
          return `rotate(${a}) translate(${r},0) rotate(${a > 90 ? 180 : 0})`
        })
        .text(prettyText((d) => d.node.data.name))
      if (animate) labels.attr('opacity', 0).transition().delay(TWEEN_MS * 0.6).duration(160).attr('opacity', 1)

      const centre = gg.append('g').style('cursor', scope ? 'pointer' : 'default')
      centre.on('click', () => {
        if (st.scope) zoomCh.set(null)
      })
      centre.append('circle').attr('r', r0 - 6).attr('fill', 'transparent')
      centre
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('y', -2)
        .attr('font-size', Math.max(16, R * 0.16))
        .attr('font-weight', 600)
        .attr('fill', t.ink)
        .text(prettyText(spec.fmt(root.value ?? 0)))
      centre
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('y', 16)
        .attr('fill', t.mute)
        .attr('font-size', 11.5)
        .text(prettyText(scope ? `${scope} · tap to go back` : spec.unit))

      if (spec.isMode) wireModeHover(gg.node() as Element)
    }
    render(false)
    const unsubscribe = zoomCh.subscribe((v) => {
      const next = known(v)
      if (next === (st.scope ?? null)) return
      st.scope = next
      render(true)
    })

    return {
      dispose: unsubscribe,
      legend: model.legend,
      label: `Sunburst of ${spec.unit} for ${env.focus?.label ?? env.scenarios[0]?.label ?? ''}`,
    }
  },
}

export default kind
