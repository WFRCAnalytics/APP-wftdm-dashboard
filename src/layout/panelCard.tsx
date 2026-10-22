import { Component, Suspense, useMemo, type ReactNode } from 'react'

import { PanelErrorState } from '@/panels/PanelErrorState'
import { PanelLoadingState } from '@/panels/PanelLoadingState'
import { registry } from '@/panels/registry'
import { EXPANDABLE_PANEL_TYPES } from '@/panels/expandablePanelTypes'
import { MultiViewTile } from '@/layout/multiViewTile'
import { Tile } from '@/layout/tile'
import { useFill, withFillHeight } from '@/layout/fill'
import type { MultiViewPanelConfig, PanelConfig } from '@/layout/types'

// React error boundaries require a class component — no hook equivalent
// exists. The one deliberate exception to "function components only" in
// the panel pattern (constitution v2.2.0), scoped narrowly to this single
// shared, cross-cutting concern — not a precedent for panel components
// themselves. Catches synchronous render-time throws only; a panel's own
// rejected query promise is that panel's own responsibility to catch
// (ValueBoxPanel.tsx/the retired chart panel both do, via their own .catch()).
interface PanelErrorBoundaryProps {
  panelTitle: string
  children: ReactNode
}
interface PanelErrorBoundaryState {
  hasError: boolean
}

// Exported (030-sidebar-navigation) — the chromeless full-page render
// path (dashboardRenderer.tsx) reuses this SAME error boundary directly,
// per contracts/sidebar-shell.md: "the resolved single PanelConfig
// renders via the SAME registry[config.type] lookup + PanelErrorBoundary
// every other panel already uses." No duplicate boundary implementation.
export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  state: PanelErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): PanelErrorBoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return <PanelErrorState message={`"${this.props.panelTitle}" failed to render`} />
    }
    return this.props.children
  }
}

// FR-010: a panel's failure — unknown type, or a render-time throw caught
// by the boundary above — MUST NOT affect any other panel. Centralizing
// both checks here (rather than duplicating them per panel type)
// structurally guarantees that, per contracts/panel-registry.md.
//
// `tileKey` (`pageId:tileId`, 063 redesign) keys the tile's session state (chosen view, group, strategy).
export function PanelCard({ config, tileKey }: { config: PanelConfig; tileKey?: string }) {
  if (config.type === 'multi-view') {
    return <MultiViewTile config={config as MultiViewPanelConfig} tileKey={tileKey ?? `multi-view:${config.title}`} />
  }
  return <PlainTile config={config} />
}

function PlainTile({ config: authored }: { config: PanelConfig }) {
  const fill = useFill()
  const config = useMemo(() => withFillHeight(authored, fill), [authored, fill.active, fill.height]) // eslint-disable-line react-hooks/exhaustive-deps
  const PanelComponent = registry[config.type]
  // 034-metric-panel-redesign (FR-001/FR-002, and the Part A addendum's
  // FR-023–FR-025): config.expandable, when the author set it explicitly,
  // always wins over EXPANDABLE_PANEL_TYPES' per-TYPE default (`??`, not
  // `||`: an explicit `false` must not fall through to the default).
  const isExpandable = config.expandable ?? EXPANDABLE_PANEL_TYPES.has(config.type)

  // 042-boot-performance-fix: registry[config.type] is a React.lazy()
  // component, so <Suspense> is required; it sits INSIDE the error
  // boundary so a rejected dynamic import is caught by the same boundary
  // as every other render failure.
  const panelElement = PanelComponent ? (
    <PanelErrorBoundary panelTitle={config.title}>
      <Suspense fallback={<PanelLoadingState height={config.height} />}>
        <PanelComponent config={config} />
      </Suspense>
    </PanelErrorBoundary>
  ) : null

  return (
    <Tile
      title={config.title}
      subtitle={config.description}
      height={config.height}
      expandable={isExpandable}
      panel={panelElement}
      errorMessage={PanelComponent ? undefined : `Unknown panel type: "${config.type}"`}
    />
  )
}
