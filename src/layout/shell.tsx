import { useLayoutEffect, useRef, useState } from 'react'
import { LayoutDashboard } from 'lucide-react'

import { DashboardRenderer } from '@/layout/dashboardRenderer'
import { NavBar } from '@/layout/navBar'
import { SettingsModal } from '@/layout/settingsModal'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import { useNavBarVisibilityMode } from '@/hooks/useNavBarVisibilityMode'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import type { DashboardTabConfig } from '@/layout/types'

// Top-level app shell: NavBar + the active tab's DashboardRenderer.
// Active-tab selection is local component state, not a global store —
// tab selection isn't a cross-cutting filter (constitution's no-Web-
// Storage rule doesn't apply to transient UI state either way).
//
// Nav-bar visibility mode (Settings modal's Appearance tab, state/
// navBarVisibilityState.ts): investigated directly before building this —
// the <header> below had NO positioning of its own before this change
// (confirmed via direct read: no `fixed`/`sticky`/`absolute` class
// anywhere on it, plain normal document flow, scrolling away with the
// page like any other block element). Both modes now use
// `position: fixed` unconditionally — 'fixed' mode and 'auto' mode differ
// ONLY in whether a translateY offset is dynamically toggled on top of
// that same fixed positioning, not in whether fixed positioning applies
// at all. Since `position: fixed` removes the header from normal document
// flow (confirmed this was NOT already compensated for anywhere — no
// existing padding/margin on <main> relied on the header's old in-flow
// height), <main> now gets an explicit `paddingTop` equal to the header's
// real, MEASURED height (ResizeObserver-driven, not a hardcoded constant —
// the header's actual height depends on font-size/theme/tab-count wrapping,
// none of which this component should need to hardcode a guess about).
export function Shell({ dashboards }: { dashboards: DashboardTabConfig[] }) {
  const [activeTab, setActiveTab] = useState(dashboards[0]?.header.tab)
  const headerRef = useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)

  const navBarMode = useNavBarVisibilityMode()
  // Scroll tracking is only ever attached while mode === 'auto' — in
  // 'fixed' mode its result is never consulted, so there's no reason to
  // pay for a real window scroll listener at all (useScrollDirection's own
  // `enabled` gate skips attaching one entirely).
  const scrollDirection = useScrollDirection(navBarMode === 'auto')
  const navBarHidden = navBarMode === 'auto' && scrollDirection === 'down'

  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) return undefined
    // Measure synchronously up front (before ResizeObserver's own first
    // callback, which — like a layout effect — fires before paint, but a
    // synchronous read here removes any doubt about a one-frame flash of
    // unpadded content behind the fixed header on first mount).
    setHeaderHeight(header.getBoundingClientRect().height)
    // Real bug, found live (not assumed): ResizeObserver's own
    // `entry.contentRect.height` reports the CONTENT-box height — it
    // excludes padding and border — whereas the synchronous measurement
    // above uses `getBoundingClientRect()`, which reports the BORDER-box
    // height (the header's real, full rendered height, padding/border
    // included). The header has both (`py-4` padding, `border-b`), so
    // `contentRect.height` under-measures it by exactly that padding+
    // border amount (confirmed empirically: 73px border-box vs. 40px
    // content-box on this header, a 33px shortfall — 16px+16px padding +
    // 1px border). ResizeObserver delivers an initial callback the
    // instant `.observe()` is called, even with no real subsequent
    // resize, so this wrong, SMALLER value overwrote the correct one
    // moments after mount and then stayed wrong forever (the header's
    // real size never changes again, so no further callback ever
    // corrects it) — a small, permanent gap between the header's real
    // height and <main>'s compensating padding, silently letting the top
    // ~33px of the first row of panels render underneath the header.
    // Invisible in 'auto' mode (the header hides on scroll, so nothing
    // is left to overlap once scrolled), but a persistent, visible
    // overlap in 'fixed' mode, where the header never leaves. Fixed by
    // re-measuring via the SAME getBoundingClientRect() the initial
    // synchronous call already uses, instead of contentRect — both call
    // sites now agree by construction, no content-vs-border-box mismatch
    // possible.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setHeaderHeight(entry.target.getBoundingClientRect().height)
    })
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

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
      <header
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-border bg-background px-6 py-4 transition-transform duration-300 ease-in-out"
        style={{ transform: navBarHidden ? 'translateY(-100%)' : 'translateY(0)' }}
      >
        <NavBar
          tabs={dashboards}
          activeTab={active.header.tab}
          onTabChange={setActiveTab}
        />
        {/* 020-settings-modal: ScenarioLoader + ThemeToggle (the previous
            top-right header group, 015-theme-toggle research.md §7) are
            replaced entirely by a single SettingsModal trigger (FR-001,
            FR-002) — not kept alongside it. */}
        <div className="flex items-center gap-3">
          <SettingsModal />
        </div>
      </header>
      <main style={{ paddingTop: headerHeight }}>
        <DashboardRenderer tab={active} />
      </main>
    </div>
  )
}
