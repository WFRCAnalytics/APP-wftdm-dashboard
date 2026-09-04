import { useState } from 'react'
import { LayoutDashboard } from 'lucide-react'

import { DashboardRenderer } from '@/layout/dashboardRenderer'
import { NavBar } from '@/layout/navBar'
import { ScenarioLoader } from '@/layout/scenarioLoader'
import { ThemeToggle } from '@/layout/themeToggle'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import type { DashboardTabConfig } from '@/layout/types'

// Top-level app shell: NavBar + the active tab's DashboardRenderer.
// Active-tab selection is local component state, not a global store —
// tab selection isn't a cross-cutting filter (constitution's no-Web-
// Storage rule doesn't apply to transient UI state either way).
export function Shell({ dashboards }: { dashboards: DashboardTabConfig[] }) {
  const [activeTab, setActiveTab] = useState(dashboards[0]?.header.tab)

  if (dashboards.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PanelEmptyState
          icon={LayoutDashboard}
          message="No dashboards available"
          hint="No dashboard-config files were discovered for this scenario."
        />
      </div>
    )
  }

  const active = dashboards.find((d) => d.header.tab === activeTab) ?? dashboards[0]

  return (
    // bg-background spans the full viewport edge to edge. Content used to
    // be capped at mx-auto max-w-7xl (003-dashboard-shell-navigation) to
    // avoid an "unreadable width" on wide viewports — but for a data-dense
    // dashboard (chart/map/table grids, not prose), that tradeoff left a
    // large, unwanted blank void down both sides on any monitor wider than
    // ~1280px, reported directly by the user. Removed entirely: nav and
    // the panel grid both now go full width, edge to edge. panelCard.tsx
    // has no width logic of its own either way — it fills whatever column
    // dashboardRenderer.tsx's grid gives it.
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <NavBar
          tabs={dashboards}
          activeTab={active.header.tab}
          onTabChange={setActiveTab}
        />
        {/* 015-theme-toggle: ScenarioLoader + ThemeToggle share one
            right-hand group (research.md §7) — top-right of the header,
            matching the user's own stated placement preference, kept
            visually grouped as one unit rather than a third
            justify-between column (which would spread it across the
            header's full width instead). */}
        <div className="flex items-center gap-3">
          <ScenarioLoader />
          <ThemeToggle />
        </div>
      </header>
      <main>
        <DashboardRenderer tab={active} />
      </main>
    </div>
  )
}
