# Contract: `HierarchicalChartHost` (`src/panels/HierarchicalChartHost.tsx`)

Satisfies FR-002, FR-003, FR-006 through FR-008, FR-012 through FR-014.
The shared architecture research.md §6 decided on — everything genuinely
common to any D3-rendered hierarchical chart, regardless of which
specific diagram is drawn. Not itself registered in `panels/registry.tsx`
— `TreemapPanel.tsx`/`SunburstPanel.tsx` are the two registered entries,
each a thin wrapper around this host.

## Renderer contract (what a chart-type-specific module implements)

```ts
export interface HierarchyRenderContext {
  container: SVGSVGElement          // already sized to the panel's real, laid-out width/height
  root: d3.HierarchyNode<HierarchyNode>  // already .sum()'d and .sort()'d — see hierarchyData.ts
  resolveColor: (categoryKey: string) => string  // already-resolved real color, getComputedStyle()-based (research.md §5) — never a raw var() string
  onFocusChange: (focus: d3.HierarchyNode<HierarchyNode> | null) => void  // called by the renderer whenever the zoomed-in node changes, so the host can drive any shared chrome (e.g. a future breadcrumb) — treemap/sunburst each decide their OWN in-SVG zoom-out affordance per research.md §3a/§3b; this callback is informational, not how zooming itself is triggered
}

export interface HierarchyRenderer {
  mount(ctx: HierarchyRenderContext): void   // first paint — creates the SVG structure and wires click-to-zoom
  update(ctx: HierarchyRenderContext): void  // re-run on new data/theme/resize — MUST reset zoom to root (data-model.md's "Zoom-state reset on data change")
  unmount(container: SVGSVGElement): void    // teardown — remove listeners/transitions, mirroring every other panel type's own unmount-only effect
}
```

`treemapRenderer.ts`/`sunburstRenderer.ts` (research.md §3a/§3b) each
export one object satisfying this shape — the host never inspects which
one it was given beyond calling these three functions.

## Host responsibilities (illustrative — confirms exact prop/hook names during implementation)

```tsx
export function HierarchicalChartHost({
  config,
  renderer,
}: {
  config: TreemapPanelConfig | SunburstPanelConfig
  renderer: HierarchyRenderer
}) {
  const filters = useFilterState(extractGlobalFilterIds(config.filter))
  const activeScenarioNames = useActiveScenarios()
  const baseline = useBaseline()
  const colorScheme = useColorScheme()
  const containerRef = useRef<SVGSVGElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [hierarchyRoot, setHierarchyRoot] = useState<d3.HierarchyNode<HierarchyNode> | null>(null)

  // Fetch effect — IDENTICAL shape to every other data-bound panel type.
  // resolveQueryAndPairs()/ensureRegistered() reused completely unmodified.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const resolved = resolveQueryAndPairs(config, filters, activeScenarioNames, baseline, config.compare_on ?? [])
    if ('error' in resolved) { setStatus('error'); return }
    ensureRegistered(resolved.pairs).then(() => query(resolved.sql)).then((rows) => {
      if (cancelled) return
      if (rows.length === 0) { setStatus('empty'); return }
      // hierarchyData.ts: flat rows -> nested structure -> d3.hierarchy().sum().sort()
      setHierarchyRoot(buildHierarchy(rows, config.path, config.value))
      setStatus('ready')
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [config, filters, activeScenarioNames, baseline])

  // Mount effect — once per panel instance.
  useEffect(() => {
    if (!containerRef.current) return
    renderer.mount({ container: containerRef.current, ... })
    return () => renderer.unmount(containerRef.current!)
  }, [])

  // Redraw effect — new data, theme flip, or resize; NEVER a new query
  // (FR-014). Resets renderer's own internal zoom state to root.
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || !hierarchyRoot) return
    renderer.update({ container: containerRef.current, root: hierarchyRoot, resolveColor, onFocusChange })
  }, [hierarchyRoot, status, colorScheme])

  if (status === 'empty') return <PanelEmptyState ... />
  if (status === 'error') return <PanelErrorState ... />
  // loading: same animate-pulse skeleton convention as every other chart panel type
  return <svg ref={containerRef} className="hierarchical-chart-svg" />
}
```

## What does NOT change

- `panels/panelQuery.ts` — zero changes; `resolveQueryAndPairs()` reused
  exactly as every comparison-capable panel type already calls it.
- `services/sqlExpander.ts` — zero changes.
- `services/tabDataLoader.ts` — zero changes; `ensureRegistered()` reused
  unmodified.
- Every existing panel type (`plotly`/`recharts`/`observable-plot`/
  `sankey`/`table`/`valuebox`/`markdown`/`flowmap`/`zonemap`/
  `graphic-walker`) — zero changes (FR-010).

## Explicitly out of scope

- A shared visual "breadcrumb" component reused identically by both
  renderers — research.md §3a/§3b confirm the real zoom-out affordance
  differs by chart type (a title bar for the treemap, a center circle
  for the sunburst); `onFocusChange` exists so the host COULD add shared
  chrome later, but this feature does not build one.
- Any hierarchy depth limit — FR-004 requires 3+ levels to render
  correctly; the host does not special-case or cap depth.
