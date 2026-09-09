import { Component, type ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PanelErrorState } from '@/panels/PanelErrorState'
import { registry } from '@/panels/registry'
import { EXPANDABLE_PANEL_TYPES } from '@/panels/expandablePanelTypes'
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
  // 034-metric-panel-redesign (FR-001/FR-002, and the Part A addendum's
  // FR-023–FR-025): whether this panel offers the expand-to-dialog
  // affordance — config.expandable, when the author set it explicitly,
  // always wins over EXPANDABLE_PANEL_TYPES' own per-TYPE default
  // (`??`, not `||`: an explicit `false` must NOT fall through to the
  // default just because it's falsy). config.type/config.expandable are
  // both fixed for the lifetime of one PanelCard instance, so this never
  // changes across this component's own re-renders.
  const isExpandable = config.expandable ?? EXPANDABLE_PANEL_TYPES.has(config.type)

  const panelElement = PanelComponent ? (
    <PanelErrorBoundary panelTitle={config.title}>
      <PanelComponent config={config} />
    </PanelErrorBoundary>
  ) : null

  // Called unconditionally regardless of whether PanelComponent resolved
  // OR whether this panel type is expandable (React's rules of hooks) —
  // passing `null` as children when PanelComponent didn't resolve is
  // harmless: the hook's own state/refs still exist, they just never have
  // anything to portal (004-panel-expand-dialog, panelExpandHost.tsx).
  // 034-metric-panel-redesign (research.md §1): for a NON-expandable panel
  // type, `trigger`/`body` are simply never placed in the JSX this
  // component returns below — the hook's own `body` value is an
  // unrendered React element tree until placed in JSX (its internal
  // `createPortal(...)` call doesn't execute/mount until then), so this
  // never double-renders `panelElement` and never leaves the hook's own
  // internal effects running against anything real. Deliberately NOT a
  // conditional hook call (`if (isExpandable) { usePanelExpandHost(...) }`)
  // — that would violate react-hooks/rules-of-hooks even though the
  // underlying invariant (config.type stable per instance) would make it
  // safe in practice; keeping the call itself unconditional, exactly as
  // before this feature, carries zero such risk.
  const { trigger, body } = usePanelExpandHost(
    config.title,
    panelElement,
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
            valid to expand at any size (004's FR-002/FR-010). No expand
            trigger for a non-expandable panel type either
            (034-metric-panel-redesign FR-001/FR-002). */}
        {PanelComponent && isExpandable && trigger}
      </CardHeader>
      <CardContent>
        {PanelComponent ? (
          isExpandable ? (
            body
          ) : (
            panelElement
          )
        ) : (
          <PanelErrorState message={`Unknown panel type: "${config.type}"`} />
        )}
      </CardContent>
    </Card>
  )
}
