import { Component, type ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { registry } from '@/panels/registry'
import { usePanelExpandHost } from '@/layout/panelExpandHost'
import type { PanelConfig } from '@/layout/types'

// React error boundaries require a class component — no hook equivalent
// exists. The one deliberate exception to "function components only" in
// the panel pattern (constitution v2.2.0), scoped narrowly to this single
// shared, cross-cutting concern — not a precedent for panel components
// themselves. Catches synchronous render-time throws only; a panel's own
// rejected query promise is that panel's own responsibility to catch
// (ValueBoxPanel.tsx/PlotlyPanel.tsx both do, via their own .catch()).
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
export function PanelCard({ config }: { config: PanelConfig }) {
  const PanelComponent = registry[config.type]

  // Called unconditionally regardless of whether PanelComponent resolved
  // (React's rules of hooks) — passing `null` as children when it didn't
  // is harmless: the hook's own state/refs still exist, they just never
  // have anything to portal (004-panel-expand-dialog, panelExpandHost.tsx).
  const { trigger, body } = usePanelExpandHost(
    config.title,
    PanelComponent ? (
      <PanelErrorBoundary panelTitle={config.title}>
        <PanelComponent config={config} />
      </PanelErrorBoundary>
    ) : null,
    // height is a common PanelConfig field (layout/types.ts), not
    // plotly-specific — passed through so the inline (collapsed)
    // presentation keeps its configured height exactly as before this
    // feature existed; a panel with no height opinion (undefined) stays
    // naturally auto-sized.
    { height: config.height },
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{config.title}</CardTitle>
        {/* No expand trigger for an "unknown panel type" card — nothing
            valid to expand at any size (004's FR-002/FR-010). */}
        {PanelComponent && trigger}
      </CardHeader>
      <CardContent>
        {PanelComponent ? body : <PanelErrorState message={`Unknown panel type: "${config.type}"`} />}
      </CardContent>
    </Card>
  )
}
