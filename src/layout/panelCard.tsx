import { Component, type ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { registry } from '@/panels/registry'
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

class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <PanelErrorBoundary panelTitle={config.title}>
          {PanelComponent ? (
            <PanelComponent config={config} />
          ) : (
            <PanelErrorState message={`Unknown panel type: "${config.type}"`} />
          )}
        </PanelErrorBoundary>
      </CardContent>
    </Card>
  )
}
