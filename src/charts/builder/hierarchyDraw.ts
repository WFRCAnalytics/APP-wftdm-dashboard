// 065-chart-builder: draws the treemap and sunburst of a compiled chart as zoomable hierarchies of any depth, in the manner of
// Observable's zoomable treemap and zoomable sunburst. Click a group to zoom into it (tiles and arcs are tweened from where they
// were); click the breadcrumb (treemap) or the centre (sunburst) to go up a level. The compiler decides every colour and tooltip
// (HTree); this only places them. The open group is a path of names (for a Sankey, one entry naming the node in focus) in `HierState`, owned by the caller, so a redraw (hover,
// resize) keeps the zoom.
import { hierarchy, partition, treemap, type HierarchyRectangularNode } from 'd3-hierarchy'
import { select, type Selection } from 'd3-selection'
import { arc as d3arc } from 'd3-shape'
import 'd3-transition'

import type { DrawnChart, HNode, HTree } from '@/charts/builder/compile'
import type { ChartTheme } from '@/charts/types'
import { zoomableSankey } from '@/charts/builder/sankeyDraw'
import { tooltip } from '@/services/tooltip'

/** The open group of each panel as the names from the top down (empty: the whole chart), by panel index. */
export type HierState = Record<number, string[]>

const NS = 'http://www.w3.org/2000/svg'
const TWEEN_MS = 380
/** Rings of a sunburst, and levels of a treemap, shown at once; zooming into a group reveals the ones below it. */
const SUN_RINGS = 3
const mix = (a: number, b: number, u: number) => a + (b - a) * u

type G = Selection<SVGGElement, unknown, null, undefined>
interface Box { x0: number; y0: number; x1: number; y1: number }
interface Arc { a0: number; a1: number; ir: number; or: number }
type Cut = HNode & { deep?: boolean }

const fmt = (v: number): string => {
  const a = Math.abs(v)
  if (a >= 1e9) return `${+(v / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}k`
  return String(Math.round(v * 100) / 100)
}
const clip = (t: string, px: number) => (t.length * 6.4 > px ? `${t.slice(0, Math.max(1, Math.floor(px / 6.4) - 1))}…` : t)
const solid = (n: HNode) => !n.fill.startsWith('url')

export function drawHierarchy(model: DrawnChart, theme: ChartTheme, state: HierState): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${model.W} ${model.H}`)
  svg.setAttribute('role', 'img')
  svg.style.overflow = 'visible'
  const defs = select(svg).append('defs')
  for (const d of model.defs) {
    const p = defs.append('pattern').attr('id', d.id).attr('patternUnits', 'userSpaceOnUse').attr('width', 8).attr('height', 8)
    p.append('rect').attr('width', 8).attr('height', 8).attr('fill', d.color).attr('fill-opacity', 0.16)
    p.append('path').attr('d', d.d).attr('stroke', d.color).attr('stroke-width', d.sw).attr('fill', d.fill)
  }
  ;(model.trees ?? []).forEach((tree, i) => {
    const g = select(svg).append('g').attr('transform', tree.tf) as unknown as G
    if (tree.title) g.append('text').attr('x', 0).attr('y', 11).attr('font-size', 12.5).attr('font-weight', 600).attr('fill', theme.ink).text(tree.title)
    const body = g.append('g') as G
    if (tree.kind === 'treemap') zoomableTreemap(body, tree, theme, state, i)
    else zoomableSunburst(body, tree, theme, state, i)
  })

  ;(model.sankeys ?? []).forEach((sk, i) => {
    const g = select(svg).append('g').attr('transform', sk.tf) as unknown as G
    if (sk.title) g.append('text').attr('x', 0).attr('y', 11).attr('font-size', 12.5).attr('font-weight', 600).attr('fill', theme.ink).text(sk.title)
    zoomableSankey(g.append('g') as G, sk, theme, state, i)
  })

  const show = (e: MouseEvent) => {
    const t = (e.target as Element).closest?.('[data-t]')?.getAttribute('data-t')
    if (!t) { tooltip.hide(); return }
    const [title, ...rest] = t.split('~')
    tooltip.show({ title, rows: rest.map((p) => { const k = p.indexOf('\u0001'); return { k: p.slice(0, k), v: p.slice(k + 1) } }) }, e)
  }
  svg.addEventListener('mouseover', show)
  svg.addEventListener('mousemove', show)
  svg.addEventListener('mouseleave', () => tooltip.hide())
  return svg
}

/** The node the path leads to, and the part of the path that still exists (a stale name after the data changed is dropped). */
function resolve(tree: HTree, path: string[] | undefined): { node: HNode; path: string[] } {
  let node = tree.root
  const kept: string[] = []
  for (const name of path ?? []) {
    const next = node.children?.find((c) => c.name === name)
    if (!next) break
    node = next
    kept.push(name)
  }
  // a leaf cannot be opened, so the path stops at its parent
  if (!node.children?.length && kept.length) {
    kept.pop()
    return resolve(tree, kept)
  }
  return { node, path: kept }
}

/** The node and everything under it down to `levels`; the nodes cut off keep `deep` so a click can tell they hold more. */
function cut(n: HNode, levels: number): Cut {
  if (levels === 0 || !n.children?.length) return { ...n, children: undefined }
  return { ...n, children: n.children.map((c) => cut(c, levels - 1)) }
}
const hasMore = (orig: HNode | undefined) => !!orig?.children?.length

// ---------------------------------------------------------------------------------------------------------------- treemap

function zoomableTreemap(body: G, tree: HTree, T: ChartTheme, state: HierState, idx: number): void {
  const w = tree.w
  const h = tree.h - tree.head
  const holder = body.attr('transform', `translate(0,${tree.head})`) as G
  let prev: Map<string, Box> | undefined

  const render = (animate: boolean) => {
    const here = resolve(tree, state[idx])
    state[idx] = here.path
    const at = here.path
    const original = (names: string[]) => names.reduce<HNode | undefined>((n, name) => n?.children?.find((c) => c.name === name), here.node)
    // the group in focus, two levels of it: its parts, and the parts' own parts as the tiles
    const root = hierarchy<Cut>(cut(here.node, 2), (d) => d.children).sum((d) => (d.children ? 0 : d.value)).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    treemap<Cut>().size([w, h]).paddingInner(3).paddingTop((d) => (d.children && (d.depth === 1 || (d.depth === 0 && at.length)) ? 22 : 0)).round(true)(root)
    const leaves = root.leaves() as HierarchyRectangularNode<Cut>[]
    const names = (d: HierarchyRectangularNode<Cut>) => d.ancestors().reverse().slice(1).map((a) => a.data.name)
    const key = (d: HierarchyRectangularNode<Cut>) => [...at, ...names(d)].join('\u0001')
    const before = prev
    prev = new Map(leaves.map((d) => [key(d), { x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1 }]))
    const go = (to: string[]) => { state[idx] = to; tooltip.hide(); render(true) }

    holder.selectAll('*').remove()
    const head = holder.append('g')
    if (at.length) {
      head.append('text').attr('x', 1).attr('y', 14).attr('font-weight', 600).attr('fill', T.ink).style('cursor', 'zoom-out').on('click', () => go(at.slice(0, -1)))
        .text(`‹ ${at.join(' › ')}`).append('tspan').attr('font-weight', 400).attr('fill', T.mute).text(`  ${fmt(here.node.value)} · click to go up`)
    }
    // a group with parts of its own is headed by its name; click the name to open it
    head.selectAll('text.grp').data((root.children ?? []).filter((d) => d.children) as HierarchyRectangularNode<Cut>[]).join('text').attr('class', 'grp')
      .attr('x', (d) => d.x0 + 1).attr('y', (d) => d.y0 + 14).attr('font-weight', 600).attr('fill', T.ink).style('cursor', 'zoom-in')
      .on('click', (_e, d) => go([...at, d.data.name]))
      .text((d) => (d.x1 - d.x0 > 60 ? clip(d.data.name, d.x1 - d.x0 - 8) : ''))
      .append('tspan').attr('font-weight', 400).attr('fill', T.mute).text((d) => (d.x1 - d.x0 > 130 ? `  ${fmt(d.value ?? 0)}` : ''))

    // a tile opens the group it sits in, one level down from the view: never further, so each click is one step
    const target = (d: HierarchyRectangularNode<Cut>): string[] | null => {
      const first = names(d)[0]
      return hasMore(original([first])) ? [...at, first] : null
    }
    const leaf = holder.append('g').selectAll<SVGGElement, HierarchyRectangularNode<Cut>>('g').data(leaves).join('g')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)
      .attr('data-t', (d) => d.data.tip).attr('opacity', (d) => d.data.op)
      .style('cursor', (d) => (target(d) ? 'zoom-in' : 'default'))
      .on('click', (_e, d) => { const t = target(d); if (t) go(t) })
    leaf.append('rect').attr('width', (d) => Math.max(0, d.x1 - d.x0)).attr('height', (d) => Math.max(0, d.y1 - d.y0)).attr('rx', 4).attr('fill', (d) => d.data.fill)
      .attr('stroke', (d) => (solid(d.data) ? 'none' : d.data.color))
    const total = root.value || 1
    const labels = leaf.filter((d) => d.x1 - d.x0 > 54 && d.y1 - d.y0 > 30).append('text').attr('font-size', T.fs).style('pointer-events', 'none')
      .attr('fill', (d) => (solid(d.data) ? T.onColor(d.data.color) : T.ink))
    labels.append('tspan').attr('x', 8).attr('y', 18).text((d) => clip(d.data.name, d.x1 - d.x0 - 12))
    labels.append('tspan').attr('x', 8).attr('y', 33).text((d) => `${Math.round(((d.value ?? 0) / total) * 100)}%`)

    if (animate && before) {
      labels.attr('opacity', 0)
      leaf.transition().duration(TWEEN_MS).tween('box', function (d) {
        const from = before.get(key(d)) ?? { x0: d.x0, y0: d.y0, x1: d.x0, y1: d.y0 }
        const g = this as SVGGElement
        const r = g.firstChild as SVGRectElement
        return (u: number) => {
          g.setAttribute('transform', `translate(${mix(from.x0, d.x0, u)},${mix(from.y0, d.y0, u)})`)
          r.setAttribute('width', String(Math.max(0, mix(from.x1 - from.x0, d.x1 - d.x0, u))))
          r.setAttribute('height', String(Math.max(0, mix(from.y1 - from.y0, d.y1 - d.y0, u))))
        }
      })
      labels.transition().delay(TWEEN_MS * 0.7).duration(160).attr('opacity', 1)
    }
  }
  render(false)
}

// ---------------------------------------------------------------------------------------------------------------- sunburst

function zoomableSunburst(body: G, tree: HTree, T: ChartTheme, state: HierState, idx: number): void {
  const { w, head } = tree
  const h = tree.h - head
  const R = Math.max(40, Math.min(w, h) / 2 - 24)
  const r0 = R * 0.24
  const holder = body.attr('transform', `translate(${w / 2},${head + h / 2})`) as G
  let prev: Map<string, Arc> | undefined
  const arcGen = d3arc<Arc>().startAngle((d) => d.a0).endAngle((d) => d.a1).padAngle(0.012).padRadius(R / 2).cornerRadius(3).innerRadius((d) => d.ir).outerRadius((d) => d.or)

  const render = (animate: boolean) => {
    const here = resolve(tree, state[idx])
    state[idx] = here.path
    const at = here.path
    const original = (names: string[]) => names.reduce<HNode | undefined>((n, name) => n?.children?.find((c) => c.name === name), here.node)
    const root = hierarchy<HNode>(here.node, (d) => d.children).sum((d) => (d.children ? 0 : d.value))
    partition<HNode>().size([2 * Math.PI, 1])(root)
    // SUN_RINGS levels below the open group are drawn; deeper ones appear when a group is opened
    const rings = Math.max(1, Math.min(SUN_RINGS, root.height))
    const ring = (R - r0) / rings
    const names = (d: HierarchyRectangularNode<HNode>) => d.ancestors().reverse().slice(1).map((a) => a.data.name)
    const nodes = (root.descendants() as HierarchyRectangularNode<HNode>[]).filter((d) => d.depth > 0 && d.depth <= rings)
    const data = nodes.map((d) => ({ d, k: [...at, ...names(d)].join('\u0001'), a0: d.x0, a1: d.x1, ir: r0 + (d.depth - 1) * ring + (d.depth > 1 ? 2 : 0), or: r0 + d.depth * ring - 2 }))
    const before = prev
    prev = new Map(data.map((q) => [q.k, { a0: q.a0, a1: q.a1, ir: q.ir, or: q.or }]))
    const go = (to: string[]) => { state[idx] = to; tooltip.hide(); render(true) }

    holder.selectAll('*').remove()
    const paths = holder.append('g').selectAll<SVGPathElement, (typeof data)[number]>('path').data(data).join('path')
      .attr('d', (q) => arcGen(q))
      .attr('fill', (q) => q.d.data.fill).attr('stroke', (q) => (solid(q.d.data) ? T.surface : q.d.data.color)).attr('stroke-width', 1.5)
      .attr('opacity', (q) => q.d.data.op).attr('data-t', (q) => q.d.data.tip)
      .style('cursor', (q) => (hasMore(original([names(q.d)[0]])) ? 'zoom-in' : 'default'))
      // an arc opens the ring-one group it belongs to, one level down from the view, so each click is one step
      .on('click', (_e, q) => { const first = names(q.d)[0]; if (hasMore(original([first]))) go([...at, first]) })
    if (animate && before) {
      paths.transition().duration(TWEEN_MS).attrTween('d', (q) => {
        const from = before.get(q.k) ?? { a0: q.a0, a1: q.a0, ir: q.ir, or: q.ir }
        return (u: number) => arcGen({ a0: mix(from.a0, q.a0, u), a1: mix(from.a1, q.a1, u), ir: mix(from.ir, q.ir, u), or: mix(from.or, q.or, u) }) ?? ''
      })
    }

    const labelled = data.filter((q) => (q.a1 - q.a0) * ((q.ir + q.or) / 2) > 46 && q.or - q.ir > 24)
    const labels = holder.append('g').selectAll('text').data(labelled).join('text').style('pointer-events', 'none').attr('text-anchor', 'middle').attr('dy', '.35em').attr('font-size', T.fs)
      .attr('fill', (q) => (solid(q.d.data) ? T.onColor(q.d.data.color) : T.ink))
      .attr('transform', (q) => {
        const a = (((q.a0 + q.a1) / 2) * 180) / Math.PI - 90
        return `rotate(${a}) translate(${(q.ir + q.or) / 2},0) rotate(${a > 90 ? 180 : 0})`
      })
      .text((q) => clip(q.d.data.name, Math.min(q.or - q.ir, (q.a1 - q.a0) * ((q.ir + q.or) / 2)) * 1.5))
    if (animate) labels.attr('opacity', 0).transition().delay(TWEEN_MS * 0.6).duration(160).attr('opacity', 1)

    // the centre is the open group; click it to go up a level
    const open = at.length > 0
    const onFill = open && solid(here.node) ? T.onColor(here.node.color) : null
    const centre = holder.append('g').style('cursor', open ? 'zoom-out' : 'default').on('click', () => { if (open) go(at.slice(0, -1)) })
    centre.append('circle').attr('r', r0 - 4).attr('fill', open ? here.node.fill : 'transparent').attr('opacity', open ? here.node.op : 1).attr('data-t', open ? here.node.tip : null)
    centre.append('text').attr('text-anchor', 'middle').attr('y', 0).attr('font-size', 16).attr('font-weight', 600).attr('fill', onFill ?? T.ink).style('pointer-events', 'none').text(fmt(here.node.value))
    centre.append('text').attr('text-anchor', 'middle').attr('y', 16).attr('font-size', T.fs).attr('fill', onFill ?? T.mute).style('pointer-events', 'none').text(clip(open ? at[at.length - 1] : tree.unit, r0 * 1.6))
    if (open) centre.append('text').attr('text-anchor', 'middle').attr('y', 30).attr('font-size', T.fs - 1).attr('fill', onFill ?? T.mute).style('pointer-events', 'none').text('click to go up')
  }
  render(false)
}
