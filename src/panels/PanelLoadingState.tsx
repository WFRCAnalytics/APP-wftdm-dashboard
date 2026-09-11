// 042-boot-performance-fix: Suspense fallback for a lazily-loaded panel
// component (panels/registry.tsx's React.lazy() entries) — shown for the
// window between a tab first rendering a panel of a given type and that
// type's own JS chunk finishing its dynamic import(). Deliberately
// generic/type-agnostic, unlike each panel's own internal data-loading
// skeleton (e.g. PlotlyPanel.tsx's own `animate-pulse` block) — this fires
// BEFORE the panel component itself has even mounted, so there is no
// panel-specific shape to mirror yet. Reuses the exact `animate-pulse
// rounded-md bg-muted` treatment main.tsx's own pre-mount skeleton and
// every panel type's own loading state already establish (wftdm-design-
// system skill's Skeleton section) — no new visual language introduced.
export interface PanelLoadingStateProps {
  height?: number
}

export function PanelLoadingState({ height }: PanelLoadingStateProps) {
  return (
    <div
      role="status"
      aria-label="Loading panel"
      className="animate-pulse rounded-md bg-muted"
      style={{ height: height ?? 350, minHeight: 100 }}
    />
  )
}
