# Contract: `SankeyPanel` (`src/panels/SankeyPanel.tsx`)

Satisfies: FR-001 through FR-009. The sixth and final originally-listed
panel type — follows the config → query → render shape every prior
data-bound panel type already uses, but with a genuinely new data-transform
problem (research.md §4/§7) and a genuinely new rendering model (research.md
§2/§3) neither `PlotlyPanel` nor `ObservablePlotPanel` needed in the same
shape. `sankeyGraph.ts`'s rows-to-graph transform and layout wrapper below
are this feature's actually novel pieces — given full, non-illustrative
bodies rather than sketched, matching 007's own precedent for
`extractGlobalFilterIds`/`PanelLocalInput`.

**Two real bugs were found in an earlier draft of this contract's code and
are fixed in the version below** — see the inline comments at each fix
site for what was wrong and why:

1. `buildFlowGraph`'s link-aggregation map was keyed by a delimited string
   and reconstructed `sourceId`/`targetId` by splitting that key back
   apart — silently wrong whenever a raw source/target value itself
   contains the delimiter character, misaligning every downstream
   `sourceId`/`targetId`. Fixed by keying the map for lookup only and
   storing the actual `FlowLink` object as the value, never reconstructed
   from the key.
2. The render-and-swap effect's resize guard was a `useRef` — persisting
   across the component's full lifetime, so a filter-driven data change
   (new `rows`, unchanged container size) was silently skipped by the
   "same size as last render" check, breaking filter reactivity. Fixed by
   declaring the guard as a plain local variable inside the effect body
   (matching `ObservablePlotPanel.tsx`'s real, already-shipped pattern
   exactly), so it resets fresh every time the effect re-runs for a real
   reason.

## Shape — pure graph transform + layout (`src/panels/sankeyGraph.ts`)

```ts
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
  // BUG FIX (see file header, item 1): an earlier draft keyed this map by
  // a delimited string and recovered sourceId/targetId by splitting that
  // key back apart at render time — silently wrong whenever a raw
  // source/target value contains the delimiter character (e.g. a mode
  // label like "Drive to Transit" broke a space-delimited key into more
  // than two pieces, misaligning every downstream sourceId/targetId).
  // Fixed here by keying strictly for aggregation lookup and storing the
  // real FlowLink object as the map's value — sourceId/targetId are never
  // parsed back out of the key string at all.
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
    // split back apart — see BUG FIX comment above.
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
  const generator = d3Sankey<FlowNode, FlowLink>()
    .nodeId((d) => d.id)
    .nodeWidth(16)
    .nodePadding(12)
    .extent([
      [0, 0],
      [width, height],
    ])

  const { nodes, links } = generator({
    nodes: graph.nodes.map((n) => ({ ...n })),
    links: graph.links.map((l) => ({ source: l.sourceId, target: l.targetId, value: l.value })),
  })

  const pathGenerator = sankeyLinkHorizontal()

  return {
    nodes: nodes as SankeyLayoutNode[],
    links: (links as (SankeyLayoutLink & { source: SankeyLayoutNode; target: SankeyLayoutNode })[]).map(
      (l) => ({
        sourceId: l.source.id,
        targetId: l.target.id,
        value: l.value,
        y0: l.y0,
        y1: l.y1,
        width: l.width,
        path: pathGenerator(l) ?? '',
      }),
    ),
  }
}
```

## Shape — color resolution (`src/panels/sankeyColor.ts`, research.md §6)

```ts
// Pure — no DOM, no CSS custom-property reads (those happen in
// SankeyPanel.tsx via getComputedStyle against the mounted container, the
// same pattern any design-token-consuming render code in this app already
// needs, since a CSS variable's resolved value isn't available to a
// Node-environment Vitest test). This module maps a `color_scheme` string
// to a concrete color array OR signals "use the token-derived default" —
// it never resolves the token values themselves.
import { schemeTableau10, schemeObservable10, schemeCategory10, schemeSet3 } from 'd3-scale-chromatic'

const NAMED_SCHEMES: Record<string, readonly string[]> = {
  Tableau10: schemeTableau10,
  Observable10: schemeObservable10,
  Category10: schemeCategory10,
  Set3: schemeSet3,
}

/** Returns the matching scheme's colors, or undefined for an omitted/
 * unrecognized name — the caller falls back to the token-derived default
 * in either case, never a hard error (FR-005, FR-006's error-state
 * reservation is for structural/query problems only). */
export function resolveNamedColorScheme(colorScheme: string | undefined): readonly string[] | undefined {
  if (!colorScheme) return undefined
  return NAMED_SCHEMES[colorScheme]
}
```

## Shape — component (`src/panels/SankeyPanel.tsx`)

```tsx
const ALL_FILTERS: ['*'] = ['*']

// Token-derived categorical fallback (research.md §6) — resolved once
// against the mounted container's computed style, not hardcoded hex
// values, so a future tokens.css change is picked up automatically.
const FALLBACK_TOKEN_VARS = ['--primary', '--brand-wfrc-secondary-blue', '--brand-wfrc-yellow', '--brand-wfrc-gray']

export function SankeyPanel({ config }: PanelProps<SankeyPanelConfig>) {
  const filters = useFilterState(extractGlobalFilterIds(config.filter))
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])

  // Data fetch — identical shape to every other data-bound panel type.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    query(buildPanelQuery(config, filters))
      .then((result) => {
        if (cancelled) return
        setRows(result)
        setStatus(result.length === 0 ? 'empty' : 'ready')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [config, filters])

  // Render-and-swap effect: builds the FlowGraph once per data change,
  // then (re)runs layoutFlowGraph + rebuilds the <svg> on both a data
  // change AND a ResizeObserver-triggered resize (research.md §3).
  //
  // BUG FIX (see file header, item 2): an earlier draft hoisted the
  // last-rendered-size guard into a component-level useRef, which
  // persists across the component's full lifetime. That meant a
  // filter-driven data change (new `rows`, but the container's on-screen
  // size unchanged) got silently skipped by the "same size as last
  // render" check — the guard only exists to suppress the ONE known
  // redundant ResizeObserver callback within a single mount of this
  // effect (research.md §3, the same double-fire ObservablePlotPanel.tsx
  // already solves), not to suppress every same-size render regardless of
  // cause. Fixed by declaring lastWidth/lastHeight as plain local
  // variables INSIDE the effect body, matching ObservablePlotPanel.tsx's
  // real, already-shipped `render()` closure exactly — they are
  // reinitialized fresh every time this effect re-runs for a real reason
  // (config/rows/status change), and only suppress a same-size callback
  // within that one effect instance's own lifetime.
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return
    const el = containerRef.current

    const graph = buildFlowGraph(config, rows)
    if (graph.excludedCount > 0) {
      console.warn(
        `SankeyPanel "${config.title}" (metric: ${config.metric}): excluded ${graph.excludedCount} row(s) with a non-positive value.`,
      )
    }

    let lastWidth = -1
    let lastHeight = -1

    const rebuild = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 || height === 0) return
      if (width === lastWidth && height === lastHeight) return
      lastWidth = width
      lastHeight = height
      try {
        const layout = layoutFlowGraph(graph, width, height)
        // build/replace real <svg> DOM under el from `layout`, colored via
        // resolveNamedColorScheme(config.color_scheme) or the
        // FALLBACK_TOKEN_VARS default (research.md §6) — omitted here,
        // implementation detail, not part of this contract's shape
      } catch {
        setStatus('error')
      }
    }

    rebuild()
    const observer = new ResizeObserver(rebuild)
    observer.observe(el)
    return () => observer.disconnect()
  }, [config, rows, status])

  useEffect(() => {
    return () => { /* no imperative teardown call needed — no library
      instance to purge, unlike Plotly.purge(); replacing the container's
      children is enough */ }
  }, [])

  if (status === 'loading') return <div className="animate-pulse ..." />
  if (status === 'empty') return <PanelEmptyState />
  if (status === 'error') return <PanelErrorState />
  return <div ref={containerRef} style={{ height: config.height ?? 350 }} />
}
```

`query`/`buildPanelQuery`/`extractGlobalFilterIds`/`useFilterState` are the
same direct imports every prior panel type already uses — no new query
plumbing introduced by this feature (Grammar findings #4/#5).
