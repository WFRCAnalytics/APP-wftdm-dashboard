import { useState } from 'react'
import { LayoutDashboard } from 'lucide-react'

import { DashboardRenderer } from '@/layout/dashboardRenderer'
import { NavBar } from '@/layout/navBar'
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <NavBar
          tabs={dashboards}
          activeTab={active.header.tab}
          onTabChange={setActiveTab}
        />
      </header>
      <main>
        <DashboardRenderer tab={active} />
      </main>
    </div>
  )
}
