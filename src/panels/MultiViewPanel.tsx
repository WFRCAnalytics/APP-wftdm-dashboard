import { useMemo } from 'react'

import { PanelErrorBoundary } from '@/layout/panelCard'
import { useExpandedHeight } from '@/layout/panelExpandHost'
import type { MultiViewPanelConfig } from '@/layout/types'
import { useResolvedView } from '@/hooks/useViewContext'
import { useTileKey, useTileState } from '@/hooks/useTileState'
import { CompareHost } from '@/panels/CompareHost'
import { effectiveStrategy } from '@/panels/compareStrategy'
import { PanelErrorState } from '@/panels/PanelErrorState'
import type { PanelProps } from '@/panels/registry'
import { resolveMultiView, validateMultiView, withRowHeight } from '@/panels/multiView'

// The body of a `multi-view` tile: the active view rendered as an ordinary panel. The view, group and strategy
// controls live in the tile chrome (layout/multiViewTile.tsx) and share this component's state through the tile store.
export function MultiViewPanel({ config: rawConfig }: PanelProps<MultiViewPanelConfig>) {
  const key = useTileKey() || `multi-view:${rawConfig.title}`
  const [tile] = useTileState(key)
  const ctx = useResolvedView()
  // expanded: the view fills the dialog instead of keeping the card's height
  const expandedHeight = useExpandedHeight()
  const config = useMemo(() => {
    const sized = withRowHeight(rawConfig, ctx.active.length)
    return expandedHeight ? { ...sized, height: expandedHeight } : sized
  }, [rawConfig, ctx.active.length, expandedHeight])
  const error = useMemo(() => validateMultiView(config), [config])
  const resolved = useMemo(
    () => (error ? null : resolveMultiView(config, tile, { compare: ctx.compare })),
    [config, error, tile.view, tile.group, tile.strategy, ctx.compare], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // The tab-level default basemap is injected onto the multi-view config; hand it to a map view.
  const panelConfig = useMemo(() => {
    if (!resolved) return null
    const inherited = (config as { _tabDefaultBasemap?: unknown })._tabDefaultBasemap
    return inherited === undefined ? resolved.panel : ({ ...resolved.panel, _tabDefaultBasemap: inherited } as typeof resolved.panel)
  }, [resolved, config])

  if (error || !resolved || !panelConfig) return <PanelErrorState message={error ?? 'Invalid multi-view'} />
  const strategy = effectiveStrategy({
    strategies: resolved.strategies,
    chosen: tile.strategy,
    scenarioIndependent: resolved.scenarioIndependent,
    compare: ctx.compare,
    display: ctx.display,
  })
  return (
    <PanelErrorBoundary panelTitle={config.title} key={`${resolved.view.id}:${resolved.groupOption?.id ?? ''}`}>
      <CompareHost panel={panelConfig} strategy={strategy} tileKey={key} title={config.title} />
    </PanelErrorBoundary>
  )
}
