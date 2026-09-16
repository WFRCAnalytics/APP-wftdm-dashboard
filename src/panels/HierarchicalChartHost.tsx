import { useEffect, useRef, useState } from 'react'
import { hierarchy as buildD3Hierarchy, type HierarchyRectangularNode } from 'd3-hierarchy'
import { ChartNoAxesColumn } from 'lucide-react'

import { query } from '@/services/duckdb'
import { useFilterState } from '@/hooks/useFilterState'
import { useActiveScenarios } from '@/hooks/useActiveScenarios'
import { useBaseline } from '@/hooks/useBaseline'
import { useColorScheme } from '@/hooks/useColorScheme'
import { ensureRegistered } from '@/services/tabDataLoader'
import { resolveQueryAndPairs, extractGlobalFilterIds } from '@/panels/panelQuery'
import { buildHierarchy, type HierarchyNode } from '@/panels/hierarchyData'
import { resolveHierarchyColorScheme } from '@/panels/hierarchyColor'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { HierarchicalPanelConfigBase } from '@/layout/types'

const ALL_FILTERS: ['*'] = ['*']

// 058-hierarchical-chart-panels, research.md §6 — the shared host every
// hierarchical chart type plugs into (treemapRenderer.ts/sunburstRenderer.ts),
// the same "host wraps a non-React rendering library via useEffect+ref;
// the library-specific logic is a pluggable function" shape
// ObservablePlotPanel.tsx already uses for Plot.plot(), generalized to
// accept more than one possible renderer. Query/loading/empty/error state
// and theme-token color resolution are genuinely shared across both chart
// types; the actual zoom-interaction drawing code is not (research.md
// §3a/§3b confirm the two chart types' own zoom mechanics are different D3
// idioms) — each renderer owns that part entirely.

/** What a chart-type-specific renderer receives on every (re)draw.
 * `container` is a plain, `position: relative` <div> — NOT an <svg> — so
 * that mapTooltip.ts's `createMapTooltip()` (this app's own established,
 * proven hover-tooltip mechanism; SankeyPanel.tsx already uses it the
 * identical way, for the identical reason: a native SVG `<title>` has a
 * real, confirmed ~2s browser-default hover delay) has a valid HTML
 * parent to append its own absolutely-positioned tooltip <div> into. Each
 * renderer creates and owns its own <svg> child of this container. */
export interface HierarchyRenderContext {
  container: HTMLDivElement
  width: number
  height: number
  root: HierarchyRectangularNode<HierarchyNode>
  /** Already-resolved, real, current color for a TOP-LEVEL (depth-1)
   * category name — getComputedStyle()-based (research.md §5), never a
   * raw, unresolved var() left on a D3-managed node. Every descendant of
   * a given depth-1 branch shares that branch's own color, matching the
   * real zoomable-sunburst reference's own established convention
   * (`while (d.depth > 1) d = d.parent; return color(d.data.name)`). */
  resolveColor: (topLevelCategoryName: string) => string
}

/** What a chart-type-specific module (treemapRenderer.ts/sunburstRenderer.ts)
 * implements — contracts/hierarchical-chart-host.md. */
export interface HierarchyRenderer {
  /** First paint only — creates the SVG structure and wires click-to-zoom. */
  mount(ctx: HierarchyRenderContext): void
  /** Re-run on new data/theme/resize. MUST reset zoom to root (data-model.md's
   * "Zoom-state reset on data change") — never re-fetches data itself. */
  update(ctx: HierarchyRenderContext): void
  /** Teardown — remove listeners/timers, mirroring every other panel type's
   * own unmount-only effect. */
  unmount(container: HTMLDivElement): void
}

// Token-derived categorical fallback (research.md §5), mirroring
// SankeyPanel.tsx's own resolveFallbackColors() exactly, but over this
// app's real 5-token categorical set (--chart-1..5 — the same lineage
// rechartsEncoding.ts already cycles through) rather than Sankey's own
// 4-token choice.
const FALLBACK_TOKEN_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5']
// Last-resort literal values (tokens.css's own current light-mode
// --chart-1..5 values) — only used if getComputedStyle somehow resolves
// none of the vars above.
const FALLBACK_HEX_COLORS = ['#3358be', '#ba7f00', '#cc4330', '#008029', '#914edc']

function resolveFallbackColors(el: Element): string[] {
  const style = getComputedStyle(el)
  const resolved = FALLBACK_TOKEN_VARS.map((v) => style.getPropertyValue(v).trim()).filter(Boolean)
  return resolved.length > 0 ? resolved : FALLBACK_HEX_COLORS
}

/** Assigns one color per real, distinct top-level (depth-1) category name,
 * in first-seen (d3.hierarchy) order, cycling with wraparound past the
 * fifth — matching rechartsEncoding.ts's own identical cycling convention. */
function buildColorResolver(
  containerEl: Element,
  root: HierarchyRectangularNode<HierarchyNode>,
  colorScheme: string | undefined,
): (topLevelCategoryName: string) => string {
  const palette = resolveHierarchyColorScheme(colorScheme) ?? resolveFallbackColors(containerEl)
  const colorByName = new Map<string, string>()
  ;(root.children ?? []).forEach((node, index) => {
    colorByName.set(node.data.name, palette[index % palette.length])
  })
  return (topLevelCategoryName: string) => colorByName.get(topLevelCategoryName) ?? palette[0]
}

export function HierarchicalChartHost({
  config,
  renderer,
}: {
  config: HierarchicalPanelConfigBase
  renderer: HierarchyRenderer
}) {
  const filterIds = extractGlobalFilterIds(config.filter)
  const filters = useFilterState(filterIds.length ? filterIds : ALL_FILTERS)
  const activeScenarioNames = useActiveScenarios()
  const baseline = useBaseline()
  const colorScheme = useColorScheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const hasMountedRendererRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [root, setRoot] = useState<HierarchyRectangularNode<HierarchyNode> | null>(null)

  // Data fetch — identical shape to every other data-bound panel type's
  // own fetch effect. resolveQueryAndPairs()/ensureRegistered() reused
  // completely UNMODIFIED.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    const resolved = resolveQueryAndPairs(config, filters, activeScenarioNames, baseline, config.compare_on ?? [])
    if ('error' in resolved) {
      setStatus('error')
      return
    }
    const { sql, pairs } = resolved

    ensureRegistered(pairs)
      .then(() => query(sql))
      .then((rows) => {
        if (cancelled) return
        if (rows.length === 0) {
          setStatus('empty')
          return
        }
        const nested = buildHierarchy(rows, config)
        const hierarchyRoot = buildD3Hierarchy(nested)
          .sum((d) => d.value ?? 0)
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        // Not yet a real HierarchyRectangularNode at this point — x0/y0/
        // x1/y1 only exist once a renderer's own layoutRoot() (d3.treemap()/
        // d3.partition()) mutates this same object in place, which always
        // happens before either is ever read (mount()/update() call it
        // first thing). This cast documents that ordering guarantee rather
        // than leaving an unexplained `as`.
        setRoot(hierarchyRoot as unknown as HierarchyRectangularNode<HierarchyNode>)
        setStatus('ready')
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('HierarchicalChartHost: failed to load panel data', err)
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [config, filters, activeScenarioNames, baseline])

  // Mount-or-update — first call ever creates the SVG structure
  // (renderer.mount), every subsequent call (new data, theme flip, or a
  // real container resize) redraws it (renderer.update) — mirrors
  // ObservablePlotPanel.tsx's own single render()-function shape (a
  // synchronous initial call plus a ResizeObserver-driven guard against
  // duplicate same-size rebuilds), generalized to delegate the actual
  // drawing to a pluggable renderer instead of calling Plot.plot() directly.
  useEffect(() => {
    const el = containerRef.current
    if (!el || status !== 'ready' || !root) return

    let lastWidth = -1
    let lastHeight = -1

    function draw() {
      const width = el!.clientWidth
      const height = el!.clientHeight || (config.height ?? 350)
      if (width === lastWidth && height === lastHeight && hasMountedRendererRef.current) return
      lastWidth = width
      lastHeight = height

      const ctx: HierarchyRenderContext = {
        container: el!,
        width,
        height,
        root: root!,
        resolveColor: buildColorResolver(el!, root!, config.color_scheme),
      }
      if (!hasMountedRendererRef.current) {
        renderer.mount(ctx)
        hasMountedRendererRef.current = true
      } else {
        renderer.update(ctx)
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(el)
    return () => observer.disconnect()
    // colorScheme: a theme flip carries no width/height change, but forces
    // a fresh draw() call to re-resolve colors against the new theme's
    // real --chart-N values — matching ObservablePlotPanel.tsx's own
    // identical reasoning for including it in this effect's deps.
  }, [config, root, status, colorScheme, renderer])

  // Unmount-only teardown — deliberately a second effect, empty deps,
  // matching every other panel type's own established convention.
  useEffect(() => {
    return () => {
      if (containerRef.current && hasMountedRendererRef.current) {
        renderer.unmount(containerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex flex-col justify-end gap-2" style={{ height: config.height ?? 350 }} aria-hidden="true">
        <div className="flex flex-1 items-end gap-2">
          {[40, 70, 55, 90, 65, 80, 50].map((h, i) => (
            <div key={i} className="flex-1 animate-pulse rounded-t-sm bg-muted" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="h-px w-full bg-border" />
      </div>
    )
  }
  if (status === 'empty') {
    return <PanelEmptyState icon={ChartNoAxesColumn} message="No data for this selection" />
  }
  if (status === 'error') {
    return <PanelErrorState message="Couldn't load this chart" />
  }

  return (
    <div
      ref={containerRef}
      className="hierarchical-chart-container"
      style={{ position: 'relative', width: '100%', height: config.height ?? 350 }}
    />
  )
}
