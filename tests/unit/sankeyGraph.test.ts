import { describe, expect, it } from 'vitest'

import { buildFlowGraph, layoutFlowGraph } from '@/panels/sankeyGraph'
import type { SankeyPanelConfig } from '@/layout/types'

const config: Pick<SankeyPanelConfig, 'source' | 'target' | 'value'> = {
  source: 'tour_mode',
  target: 'trip_mode',
  value: 'trips',
}

describe('buildFlowGraph', () => {
  // The single most important behavior this module has to get right
  // (research.md §4) — the corrected self-loop reasoning: a same-value row
  // is NOT a self-loop once nodes are namespaced by side.
  it('namespaces a same-value row into two distinct nodes, with the correct side on each', () => {
    const rows = [{ tour_mode: 'SOV', trip_mode: 'SOV', trips: 500 }]
    const graph = buildFlowGraph(config, rows)

    expect(graph.nodes).toHaveLength(2)
    const sourceNode = graph.nodes.find((n) => n.side === 'source')
    const targetNode = graph.nodes.find((n) => n.side === 'target')
    expect(sourceNode).toBeDefined()
    expect(targetNode).toBeDefined()
    expect(sourceNode!.id).not.toBe(targetNode!.id)
    expect(sourceNode!.label).toBe('SOV')
    expect(targetNode!.label).toBe('SOV')

    expect(graph.links).toHaveLength(1)
    expect(graph.links[0].sourceId).toBe(sourceNode!.id)
    expect(graph.links[0].targetId).toBe(targetNode!.id)
    expect(graph.links[0].value).toBe(500)
  })

  it('sums value across duplicate (source, target) pairs rather than producing duplicate links', () => {
    const rows = [
      { tour_mode: 'SOV', trip_mode: 'Transit', trips: 10 },
      { tour_mode: 'SOV', trip_mode: 'Transit', trips: 5 },
    ]
    const graph = buildFlowGraph(config, rows)
    expect(graph.links).toHaveLength(1)
    expect(graph.links[0].value).toBe(15)
  })

  it('excludes non-positive-value rows and reports the correct excludedCount', () => {
    const rows = [
      { tour_mode: 'SOV', trip_mode: 'SOV', trips: 500 },
      { tour_mode: 'HOV', trip_mode: 'SOV', trips: 0 },
      { tour_mode: 'Transit', trip_mode: 'SOV', trips: -5 },
    ]
    const graph = buildFlowGraph(config, rows)
    expect(graph.excludedCount).toBe(2)
    expect(graph.links).toHaveLength(1)
  })

  // Regression coverage for the link-key aggregation bug found and fixed
  // in contracts/sankey-panel.md: an earlier draft keyed the aggregation
  // map by joining sourceId/targetId with a delimiter and recovered them
  // by splitting the key back apart — silently wrong whenever a raw
  // source/target value itself contains that delimiter. 3+ distinct nodes
  // on each side, including a multi-word raw value, asserting each link's
  // sourceId/targetId EXACTLY match the correct originating node ids — not
  // just that aggregate values are correct, since a misaligned-but-
  // numerically-correct link would not be caught by a value-only assertion.
  it('keeps every link correctly attributed to its own source/target node, including multi-word raw values', () => {
    const rows = [
      { tour_mode: 'SOV', trip_mode: 'HOV', trips: 10 },
      { tour_mode: 'SOV', trip_mode: 'Transit', trips: 20 },
      { tour_mode: 'HOV', trip_mode: 'Drive to Transit', trips: 30 },
      { tour_mode: 'Transit', trip_mode: 'Drive to Transit', trips: 40 },
      { tour_mode: 'Drive to Transit', trip_mode: 'Non-Motorized', trips: 50 },
      { tour_mode: 'Non-Motorized', trip_mode: 'SOV', trips: 60 },
    ]
    const graph = buildFlowGraph(config, rows)

    expect(graph.nodes.filter((n) => n.side === 'source')).toHaveLength(5)
    expect(graph.nodes.filter((n) => n.side === 'target')).toHaveLength(5)
    expect(graph.links).toHaveLength(6)

    const labelOf = (id: string) => graph.nodes.find((n) => n.id === id)?.label

    for (const row of rows) {
      const link = graph.links.find(
        (l) => labelOf(l.sourceId) === row.tour_mode && labelOf(l.targetId) === row.trip_mode,
      )
      expect(link, `expected a link for ${row.tour_mode} -> ${row.trip_mode}`).toBeDefined()
      expect(link!.value).toBe(row.trips)
      // The node identity itself must resolve to the correct side, not
      // merely the correct label — a link whose sourceId accidentally
      // pointed at a target-side node (or vice versa) would still pass a
      // label-only check.
      expect(graph.nodes.find((n) => n.id === link!.sourceId)?.side).toBe('source')
      expect(graph.nodes.find((n) => n.id === link!.targetId)?.side).toBe('target')
    }
  })
})

describe('layoutFlowGraph', () => {
  it('computes node/link pixel coordinates for a simple acyclic graph', () => {
    const graph = buildFlowGraph(config, [
      { tour_mode: 'SOV', trip_mode: 'SOV', trips: 500 },
      { tour_mode: 'SOV', trip_mode: 'Transit', trips: 50 },
    ])
    const layout = layoutFlowGraph(graph, 400, 300)

    expect(layout.nodes).toHaveLength(3)
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x0)).toBe(true)
      expect(Number.isFinite(node.x1)).toBe(true)
      expect(Number.isFinite(node.y0)).toBe(true)
      expect(Number.isFinite(node.y1)).toBe(true)
    }
    expect(layout.links).toHaveLength(2)
    for (const link of layout.links) {
      expect(link.width).toBeGreaterThan(0)
      expect(link.path).toMatch(/^M/) // a real SVG path 'd' string
    }
  })

  // research.md §4: structurally unreachable through this panel type's own
  // documented (namespaced, single-hop) grammar, but d3-sankey's own
  // cycle-detection is still exercised directly here — bypassing
  // buildFlowGraph's namespacing on purpose, to prove the defensive catch
  // (SankeyPanel.tsx's try/catch around this call) has something real to
  // catch, not an assumption it would work.
  it('throws a real Error for a deliberately cyclic graph', () => {
    const cyclicGraph = {
      nodes: [
        { id: 'a', side: 'source' as const, label: 'A' },
        { id: 'b', side: 'target' as const, label: 'B' },
      ],
      links: [
        { sourceId: 'a', targetId: 'b', value: 10 },
        { sourceId: 'b', targetId: 'a', value: 5 }, // b -> a closes the cycle
      ],
      excludedCount: 0,
    }
    expect(() => layoutFlowGraph(cyclicGraph, 400, 300)).toThrow()
  })
})
