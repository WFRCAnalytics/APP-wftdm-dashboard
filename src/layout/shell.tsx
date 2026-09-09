import { useState } from 'react'
import { LayoutDashboard } from 'lucide-react'

import { DashboardBrand } from '@/layout/dashboardBrand'
import { DashboardRenderer } from '@/layout/dashboardRenderer'
import { SidebarNav } from '@/layout/sidebarNav'
import { SettingsModal } from '@/layout/settingsModal'
import { DocumentationModal } from '@/layout/documentationModal'
import { PanelEmptyState } from '@/panels/PanelEmptyState'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import type { DashboardTabConfig } from '@/layout/types'
import type { DashboardBranding } from '@/services/yamlLoader'

// Real bug fix (post-completion): DashboardBrand doesn't shrink on its
// own — a full logo <img> (up to 220px) or a whitespace-nowrap title span
// rendered inside the collapsed 64px rail overflowed badly (SidebarHeader's
// own p-4 padding alone consumes 32px, leaving 32px for BOTH the brand and
// SidebarTrigger together). No compact icon-only asset exists in
// DashboardBranding at all (logoUrl/logoUrlDark/title only) — matching
// sidebarNav.tsx's own "no icon configured -> nothing shown" precedent,
// hiding DashboardBrand ENTIRELY while collapsed (rather than fabricating
// a synthetic mark) is the correct, evidence-based fix, not a compromise.
// A separate component, not inlined directly in SidebarHeader's own JSX
// below, because useSidebar() must be called from a component that is a
// REACT-TREE descendant of <SidebarProvider> — Shell() itself renders
// SidebarProvider as part of its own return value, so Shell's own function
// body runs before that context exists and cannot call the hook directly.
// DashboardBrand.tsx itself is deliberately left untouched/sidebar-unaware
// (its own header comment: "shell.tsx itself has no need to know the
// internals of [DashboardBrand]" — symmetric reasoning applies the other
// way too, DashboardBrand has no need to know about Sidebar internals).
function CollapsibleBrand({ branding }: { branding: DashboardBranding }) {
  const { state } = useSidebar()
  if (state === 'collapsed') return null
  return (
    <div className="min-w-0 flex-1">
      <DashboardBrand branding={branding} />
    </div>
  )
}

// Top-level app shell — 030-sidebar-navigation: a left Sidebar replaces the
// previous horizontal top-nav <header>. Active-tab selection is local
// component state, not a global store — tab selection isn't a cross-cutting
// filter (constitution's no-Web-Storage rule doesn't apply to transient UI
// state either way), unchanged from before this feature.
//
// The ENTIRE previous ResizeObserver/headerHeight/paddingTop measurement
// machinery is gone, not adapted (research.md §5) — that mechanism existed
// for exactly one reason (compensating <main> for a position: fixed header
// removed from normal document flow); SidebarProvider/Sidebar/SidebarInset
// is an ordinary flex sibling arrangement where nothing overlaps page
// content, so nothing needs pixel-measured compensation. Hide-on-Scroll nav
// visibility mode (useNavBarVisibilityMode/navBarVisibilityState/
// useScrollDirection) is also gone entirely, not adapted (FR-006) — its own
// "Top Bar Behavior" Settings control is removed too (appearanceTab.tsx).
export function Shell({
  dashboards,
  branding = {},
}: {
  dashboards: DashboardTabConfig[]
  branding?: DashboardBranding
}) {
  // Real, confirmed bug fix (post-completion, found via 032-six-tab-demo-
  // content's own live test run): active tab was tracked by NAME
  // (`header.tab`), resolved back to a tab object via `dashboards.find()`.
  // `main.ts`'s boot sequence always concatenates TWO dashboard-config
  // roots (a deployer's own `dashboard-config/` plus this repo's own
  // `demo-dashboard-config/`) into one array — if both roots happen to
  // name their own landing tab "Summary" (this app's own canonical,
  // encouraged convention, `CLAUDE.md`'s own default 7-tab example),
  // `.find()` always resolves to the FIRST match regardless of which of
  // the two same-named sidebar buttons was actually clicked, while BOTH
  // buttons render as "selected" simultaneously (`SidebarNav`'s own
  // `isActive` comparison has the identical name-based ambiguity) — a
  // real, reachable defect in any real deployment carrying both a
  // deployer `dashboard-config/` and this repo's own demo content, not
  // merely a test-harness coincidence. Fixed by tracking the ARRAY INDEX
  // instead — stable, always unique, and array order never changes after
  // boot (`dashboards` is a fixed prop for this component's lifetime).
  const [activeIndex, setActiveIndex] = useState(0)

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

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          {/* 028-dashboard-branding: deployer-configurable title/logo,
              genuinely optional — DashboardBrand itself renders nothing at
              all when `branding` has neither field set. min-w-0 lets it
              truncate/shrink rather than force the header to overflow at
              the sidebar's own fixed width. Hidden entirely while
              collapsed (CollapsibleBrand, above) — see that component's
              own comment. */}
          <CollapsibleBrand branding={branding} />
          <SidebarTrigger />
        </SidebarHeader>
        <SidebarContent>
          <SidebarNav tabs={dashboards} activeIndex={activeIndex} onTabChange={setActiveIndex} />
        </SidebarContent>
        {/* 020-settings-modal: the single dashboard-wide settings entry
            point relocates here from the old header's top-right group
            (FR-005) — footer-anchored, visually distinct from the primary
            tab-item list above it, and this feature's own one legitimate,
            deliberately hardcoded app-level exception (spec.md's Explicit
            scope boundary point 4) — not a dashboard-*.yaml tab at all.
            Post-completion correction (explicit user request): Documentation
            is now its own SidebarMenuItem BELOW Settings, not a tab nested
            inside it (see settingsModal.tsx/documentationModal.tsx's own
            comments) — wrapped in a SidebarMenu/SidebarMenuItem pair the
            same way the primary nav list above is, for correct list
            semantics with two stacked items instead of one. */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SettingsModal />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <DocumentationModal />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <DashboardRenderer tab={active} />
      </SidebarInset>
    </SidebarProvider>
  )
}
