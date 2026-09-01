// Pure, DOM-free (research.md §7) — d3-sankey's sankey() is itself a pure
// layout computation with no DOM dependency (research.md §2), so this
// entire module, including the actual layout call, is Vitest-testable in
// `environment: 'node'` with zero DOM shim. Only SankeyPanel.tsx builds
// real SVG DOM from this module's output.
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey'

import type { SankeyPanelConfig } from '@/layout/types'

export interface FlowNode {
  id: string
  side: 'source' | 'target'
  label: string
}

export interface FlowLink {
  sourceId: string
  targetId: string
  value: number
}

export interface FlowGraph {
  nodes: FlowNode[]
  links: FlowLink[]
  /** Rows dropped for a non-positive mapped `value` (research.md §5) —
   * always present, never optional, so a caller can't forget to check it. */
  excludedCount: number
}

/**
 * Node identity is namespaced by side (side + ":" + rawValue), NOT the raw
 * value alone — the corrected reasoning from research.md §4: a value
 * appearing on both the source and target columns (e.g. "SOV" as both a
 * tour_mode and a trip_mode) must produce two distinct nodes, or every
 * real two-way mode shift in the data becomes a graph cycle d3-sankey's
 * own layout computation throws on. This is NOT a self-loop-exclusion
 * mechanism — no valid row is ever dropped for this reason; it changes
 * node identity, not row inclusion.
 */
function nodeId(side: 'source' | 'target', rawValue: string): string {
  return side + ':' + rawValue
}

/**
 * Rows -> FlowGraph. Aggregates duplicate (source, target) pairs by
 * summing `value` (FR-003) and excludes non-positive `value` rows (FR-009)
 * before aggregation, counting them for the caller's console.warn
 * (research.md §5 — a real, if rare, data-quality signal, not silent and
 * not new on-panel UI).
 */
export function buildFlowGraph(
  config: Pick<SankeyPanelConfig, 'source' | 'target' | 'value'>,
  rows: Record<string, unknown>[],
): FlowGraph {
  const nodesById = new Map<string, FlowNode>()
  // Keyed by a composite string for aggregation lookup only — the actual
  // sourceId/targetId live in the stored FlowLink object itself and are
  // NEVER reconstructed by parsing the key back apart. A prior draft of
  // this function built the key by joining sourceId/targetId with a
  // delimiter and split() to recover them — silently wrong whenever a raw
  // source/target value itself contains that delimiter (e.g. a mode label
  // like "Drive to Transit" broke a space-delimited key into more than two
  // pieces, misaligning every downstream sourceId/targetId). Storing the
  // link object directly removes the round-trip entirely.
  const linksByKey = new Map<string, FlowLink>()
  let excludedCount = 0

  for (const row of rows) {
    const rawSource = String(row[config.source])
    const rawTarget = String(row[config.target])
    const value = Number(row[config.value])

    if (!Number.isFinite(value) || value <= 0) {
      excludedCount += 1
      continue
    }

    const sourceId = nodeId('source', rawSource)
    const targetId = nodeId('target', rawTarget)
    if (!nodesById.has(sourceId)) {
      nodesById.set(sourceId, { id: sourceId, side: 'source', label: rawSource })
    }
    if (!nodesById.has(targetId)) {
      nodesById.set(targetId, { id: targetId, side: 'target', label: rawTarget })
    }

    const linkKey = sourceId + '|' + targetId // lookup key only, never
    // split back apart — see comment above.
    const existing = linksByKey.get(linkKey)
    if (existing) {
      existing.value += value
    } else {
      linksByKey.set(linkKey, { sourceId, targetId, value })
    }
  }

  return { nodes: [...nodesById.values()], links: [...linksByKey.values()], excludedCount }
}

export interface SankeyLayoutNode extends FlowNode {
  x0: number
  x1: number
  y0: number
  y1: number
}

export interface SankeyLayoutLink extends FlowLink {
  y0: number
  y1: number
  width: number
  /** Precomputed by sankeyLinkHorizontal() — an SVG path `d` attribute
   * value, not a renderer call (research.md §2). */
  path: string
}

export interface SankeyLayout {
  nodes: SankeyLayoutNode[]
  links: SankeyLayoutLink[]
}

// d3-sankey's own generic params (N, L) are "extra properties beyond the
// Minimal shape" (@types/d3-sankey's own doc comments). N = FlowNode (the
// full node shape — id/side/label are all "extra" relative to
// SankeyNodeMinimal's own sourceLinks/value/x0/etc.). L = {} (no extra
// link properties) — the reshaped link objects below carry only
// source/target/value, exactly SankeyLinkMinimal's own required fields,
// nothing beyond it.
type NodeExtra = FlowNode
type LinkExtra = Record<string, never>

/**
 * Runs d3-sankey's own layout computation for a fixed pixel extent
 * (research.md §3 — this MUST be re-run on every container resize, not
 * just every data change, since d3-sankey's extent is pixel-absolute).
 * Throws d3-sankey's own real `Error("circular link")` if the input graph
 * is cyclic — structurally unreachable through this panel type's
 * documented two-column grammar given buildFlowGraph's side-namespacing
 * (research.md §4), but caught by the caller as a defensive backstop
 * (FR-006), not assumed impossible here.
 */
export function layoutFlowGraph(graph: FlowGraph, width: number, height: number): SankeyLayout {
  const generator = d3Sankey<NodeExtra, LinkExtra>()
    .nodeId((d) => d.id)
    .nodeWidth(16)
    .nodePadding(12)
    .extent([
      [0, 0],
      [width, height],
    ])

  const { nodes, links } = generator({
    nodes: graph.nodes.map((n) => ({ ...n })),
    links: graph.links.map((l) => ({ source: l.sourceId, target: l.targetId, value: l.value })) as never,
  })

  const pathGenerator = sankeyLinkHorizontal<NodeExtra, LinkExtra>()

  return {
    nodes: nodes as unknown as SankeyLayoutNode[],
    links: links.map((l) => {
      // Post-generation, d3-sankey replaces each link's source/target with
      // the resolved node object itself (confirmed in @types/d3-sankey's
      // own doc comments) — never re-derived by looking the id back up in
      // `graph.nodes`.
      const source = l.source as unknown as FlowNode
      const target = l.target as unknown as FlowNode
      return {
        sourceId: source.id,
        targetId: target.id,
        value: l.value,
        y0: l.y0 ?? 0,
        y1: l.y1 ?? 0,
        width: l.width ?? 0,
        path: pathGenerator(l) ?? '',
      }
    }),
  }
}
