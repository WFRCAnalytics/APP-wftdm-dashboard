import { useState } from 'react'
import { LayoutDashboard } from 'lucide-react'

import { cn } from '@/lib/utils'

import { ControlBar } from '@/layout/controlBar'
import { DashboardRenderer } from '@/layout/dashboardRenderer'
import { findFullPagePanel } from '@/layout/dashboardLayout'
import { FloatingNav } from '@/layout/floatingNav'
import { PageHeader } from '@/layout/pageHeader'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useTabsPlan } from '@/hooks/useTabsPlan'
import type { DashboardTabConfig } from '@/layout/types'
import type { DashboardBranding } from '@/services/yamlLoader'

// Top-level app shell (project-docs/redesign/02-layout-and-components.md §1): a floating glass navigation at the left,
// and a main column holding the sticky page header and the active tab. Active-tab selection is local component state,
// not a global store: tab selection is not a cross-cutting filter.
//
// The active tab is tracked by ARRAY INDEX, not by `header.tab` name. main.tsx concatenates two dashboard-config roots
// (a deployer's own and this repo's demo content); if both name their landing tab "Summary", a name lookup would resolve
// to the first match and highlight both. The array never changes after boot, so the index is stable and unique.
export function Shell({
  dashboards,
  branding = {},
}: {
  dashboards: DashboardTabConfig[]
  branding?: DashboardBranding
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  // The nav's labels are pinned open with its toggle. Pinned, the nav is DOCKED: the page's left padding grows by the same
  // amount, so the canvas shrinks to the space that is left instead of sitting under the menu. (A transient keyboard-focus
  // expansion stays an overlay; it never moves the page.) In-memory only, per the no-localStorage rule.
  const [navPinned, setNavPinned] = useState(false)
  const tabbed = useTabsPlan(dashboards[activeIndex] ?? dashboards[0]) !== null
  // Below 760px the nav is a sheet opened from the header instead of a fixed rail.
  const mobile = useMediaQuery('(max-width: 759px)')

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

  const active = dashboards[activeIndex] ?? dashboards[0]
  // `header.full_page` tabs (Explore) are chromeless: no page header, no control bar, no tile chrome.
  // A misconfigured full_page tab (not exactly one panel) falls back to ordinary rendering, header included.
  const chromeless = Boolean(active.header.full_page && findFullPagePanel(active))

  return (
    <div className="relative z-[1] min-h-screen">
      <FloatingNav
        tabs={dashboards}
        activeIndex={activeIndex}
        onTabChange={setActiveIndex}
        branding={branding}
        mobile={mobile}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        pinned={navPinned}
        onPinnedChange={setNavPinned}
      />
      {/* A chromeless full-page panel needs a DEFINITE height for its `height: 100%` chain (min-height does not give one). */}
      <main className={cn('flex flex-col', chromeless || tabbed ? 'h-dvh' : 'min-h-screen', tabbed && 'overflow-hidden', !mobile && 'transition-[padding-left] duration-[220ms] ease-out', !mobile && (navPinned ? 'pl-[276px]' : 'pl-[96px]'))}>
        {!chromeless && (
          <PageHeader title={active.header.title} subtitle={active.header.description} onMenu={mobile ? () => setMenuOpen(true) : undefined}>
            <ControlBar />
          </PageHeader>
        )}
        {chromeless && mobile && (
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
            className="fixed left-3 top-3 z-30 rounded-full border border-[var(--glass-line)] bg-[var(--tile-hi)] px-3 py-2 text-sm text-[var(--ink)]"
          >
            Menu
          </button>
        )}
        <DashboardRenderer tab={active} />
      </main>
    </div>
  )
}
