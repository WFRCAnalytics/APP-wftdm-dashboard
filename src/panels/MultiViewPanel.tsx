import { Suspense, useMemo } from 'react'

import { PanelErrorBoundary } from '@/layout/panelCard'
import type { MultiViewPanelConfig } from '@/layout/types'
import { useTileKey, useTileState } from '@/hooks/useTileState'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { PanelLoadingState } from '@/panels/PanelLoadingState'
import { registry, type PanelProps } from '@/panels/registry'
import { resolveMultiView, validateMultiView } from '@/panels/multiView'

// The body of a `multi-view` tile: the active view rendered as an ordinary panel. The view, group and strategy
// controls live in the tile chrome (layout/multiViewTile.tsx) and share this component's state through the tile store.
export function MultiViewPanel({ config }: PanelProps<MultiViewPanelConfig>) {
  const key = useTileKey() || `multi-view:${config.title}`
  const [tile] = useTileState(key)
  const error = useMemo(() => validateMultiView(config), [config])
  const resolved = useMemo(
    () => (error ? null : resolveMultiView(config, tile)),
    [config, error, tile.view, tile.group, tile.strategy], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // The tab-level default basemap is injected onto the multi-view config; hand it to a map view.
  const panelConfig = useMemo(() => {
    if (!resolved) return null
    const inherited = (config as { _tabDefaultBasemap?: unknown })._tabDefaultBasemap
    return inherited === undefined ? resolved.panel : ({ ...resolved.panel, _tabDefaultBasemap: inherited } as typeof resolved.panel)
  }, [resolved, config])

  if (error || !resolved || !panelConfig) return <PanelErrorState message={error ?? 'Invalid multi-view'} />
  const Inner = registry[panelConfig.type]
  if (!Inner) return <PanelErrorState message={`Unknown panel type: "${panelConfig.type}"`} />
  return (
    <PanelErrorBoundary panelTitle={config.title} key={`${resolved.view.id}:${resolved.groupOption?.id ?? ''}`}>
      <Suspense fallback={<PanelLoadingState height={config.height} />}>
        <Inner config={panelConfig} />
      </Suspense>
    </PanelErrorBoundary>
  )
}
