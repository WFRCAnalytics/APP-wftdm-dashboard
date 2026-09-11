import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { iconComponentFor } from '@/lib/iconComponentFor'
import { resolveSections } from '@/layout/dashboardLayout'
import type { DashboardTabConfig } from '@/layout/types'

// Replaces navBar.tsx (research.md §6) — this app's own composition of
// components/ui/sidebar.tsx: primary items from discovered tabs (icon +
// label), active-tab-only accordion section sub-nav, per
// contracts/sidebar-shell.md's Primary navigation / Accordion
// sub-navigation sections.
export interface SidebarNavProps {
  tabs: DashboardTabConfig[]
  // Real bug fix (post-completion, shell.tsx's own comment has the full
  // story): identity by ARRAY INDEX, not by `header.tab` name — two tabs
  // from different concatenated dashboard-config roots can legitimately
  // share the same display name (e.g. both named "Summary"), which broke
  // both this component's own `isActive` highlighting (both would light
  // up) and shell.tsx's `.find()`-by-name content resolution.
  activeIndex: number
  onTabChange: (index: number) => void
}

export function SidebarNav({ tabs, activeIndex, onTabChange }: SidebarNavProps) {
  // FR-017: no tab's section sub-items render at all while the sidebar is
  // collapsed to its icon-only rail — consistent with every primary item
  // also losing its text label in that state.
  const { state } = useSidebar()

  return (
    // role="tablist"/role="tab"+aria-selected — a genuine, deliberate ARIA
    // choice, not merely a test-compatibility shim: this control's real
    // interaction model (exactly one mutually-exclusive view visible at a
    // time, switched by clicking an item in this list) matches the tab
    // pattern, just rendered vertically with icons instead of the classic
    // horizontal strip. Manually applied (matching research.md §2's own
    // established "hand-apply the specific ARIA attributes this exact
    // interaction needs, skip the heavier Radix Tabs primitive" precedent
    // already used for the accordion sub-nav below) — the previous
    // navBar.tsx's own Radix-Tabs-driven role="tab"/aria-selected contract
    // is preserved for every existing test that queries
    // getByRole('tab', { name }), even though the underlying control is
    // now a plain <button>, not a Radix TabsTrigger.
    <SidebarMenu role="tablist">
      {/* One SidebarMenuItem per entry in the SAME DashboardTabConfig[]
          array shell.tsx already holds, in array order — no tab name,
          count, or order hardcoded anywhere here (FR-003), provably the
          same mechanism navBar.tsx's own {tabs.map(...)} already used. */}
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex
        const Icon = tab.header.icon ? iconComponentFor(tab.header.icon) : undefined
        const sections = isActive && state === 'expanded' ? resolveSections(tab) : []

        return (
          <SidebarMenuItem key={`${tab.header.tab}-${index}`}>
            <SidebarMenuButton
              role="tab"
              aria-selected={isActive}
              // 040-test-suite-migration (FR-019–FR-021): an optional
              // explicit accessible name. Only dashboard-8-test.yaml sets
              // header.aria_label (its visible header.tab is a single
              // space " "); for every other tab this is undefined, so no
              // aria-label attribute is emitted and the accessible name
              // still comes from the visible label — byte-for-byte
              // unchanged.
              aria-label={tab.header.aria_label}
              isActive={isActive}
              aria-expanded={sections.length > 0 ? true : undefined}
              onClick={() => onTabChange(index)}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {/* No icon configured → no icon rendered at all (never a
                  default/placeholder substitute) — Edge Cases. At the
                  collapsed icon-only width, a tab with NO icon has nothing
                  left to show (its label is hidden below) — matching
                  spec.md's own documented "effectively invisible/skipped
                  at collapsed icon-only width" behavior. */}
              {state === 'expanded' && <span className="truncate">{tab.header.tab}</span>}
            </SidebarMenuButton>

            {sections.length > 0 && (
              <ul role="group" aria-label={`${tab.header.tab} sections`} className="ml-6 mt-1 flex flex-col gap-0.5 border-l border-border pl-2">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      className="w-full truncate rounded-md px-2 py-1 text-left font-body text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        // research.md §8 — native scrollIntoView(), no new
                        // dependency, no full page navigation/reload.
                        document
                          .getElementById(`section-${section.id}`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                    >
                      {section.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
