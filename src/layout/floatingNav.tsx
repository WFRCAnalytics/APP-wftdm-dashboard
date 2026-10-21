import { useState, type MouseEvent } from 'react'
import { Moon, Sun } from 'lucide-react'

import { DashboardBrand } from '@/layout/dashboardBrand'
import { NavButton } from '@/layout/navButton'
import { SettingsModal } from '@/layout/settingsModal'
import { resolveSections } from '@/layout/dashboardLayout'
import { iconComponentFor } from '@/lib/iconComponentFor'
import { useColorScheme } from '@/hooks/useColorScheme'
import { setMode } from '@/state/themeState'
import { cn } from '@/lib/utils'
import type { DashboardTabConfig } from '@/layout/types'
import type { DashboardBranding } from '@/services/yamlLoader'

// The floating navigation (project-docs/redesign/02-layout-and-components.md §1.1). A glass rail fixed at the left edge:
// 68px wide, 248px while hovered or holding focus, overlaying the page instead of pushing it. The tab list is still
// YAML-driven and keeps its role="tablist"/"tab" contract; the selected tab shows its `sections:` as a sub-list.
export interface FloatingNavProps {
  tabs: DashboardTabConfig[]
  /** Identity by array index, not name: two roots can both name a tab "Summary" (see shell.tsx). */
  activeIndex: number
  onTabChange: (index: number) => void
  branding: DashboardBranding
  /** Below 760px the nav is a sheet opened from the header's menu button instead of a fixed rail. */
  mobile?: boolean
  open?: boolean
  onClose?: () => void
}

export function FloatingNav({ tabs, activeIndex, onTabChange, branding, mobile = false, open = false, onClose }: FloatingNavProps) {
  const [engaged, setEngaged] = useState(false)
  // After a mouse click on a tab or section the overlay steps aside until the pointer leaves and comes back, so it never
  // keeps covering the page the person just chose. Keyboard activation keeps it open (focus stays inside).
  const [dismissed, setDismissed] = useState(false)
  const dismissAfterMouse = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) return
    e.currentTarget.blur()
    setDismissed(true)
    setEngaged(false)
  }
  const scheme = useColorScheme()
  const expanded = mobile ? open : engaged

  if (mobile && !open) return null

  return (
    <>
      {mobile && <div className="fixed inset-0 z-40 bg-[rgba(5,7,10,0.62)] backdrop-blur-[6px]" onClick={onClose} aria-hidden="true" />}
      <nav
        aria-label="Dashboard"
        data-sidebar="sidebar"
        data-state={expanded ? 'expanded' : 'collapsed'}
        className={cn(
          'group/nav glass fixed bottom-[14px] left-[14px] top-[14px] z-40 flex flex-col overflow-hidden rounded-[24px] px-[10px] py-3 transition-[width] duration-[220ms]',
          expanded ? 'w-[248px]' : 'w-[68px]',
          mobile && 'w-[min(300px,calc(100vw-28px))]',
        )}
        onMouseEnter={() => !dismissed && setEngaged(true)}
        onMouseLeave={() => {
          setDismissed(false)
          setEngaged(false)
        }}
        // Only keyboard focus expands the nav: a mouse press also focuses the button, and expanding then would insert the
        // sub-list between mousedown and mouseup and shift the target out from under the click.
        onFocus={(e) => {
          if (e.target.matches(':focus-visible')) setEngaged(true)
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEngaged(false)
        }}
      >
        <div className="mb-[14px] flex min-h-[46px] items-center gap-3 overflow-hidden px-[3px]">
          <span
            aria-hidden="true"
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px] bg-[var(--brand)] shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_6px_14px_-6px_var(--brand)]"
          >
            <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="#04161A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 18 9 9l4 6 3-5 4 8" />
            </svg>
          </span>
          <div className={cn('min-w-0 transition-opacity duration-150', expanded ? 'opacity-100' : 'opacity-0')}>
            <DashboardBrand branding={branding} />
          </div>
        </div>

        <div role="tablist" aria-orientation="vertical" className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
          {tabs.map((tab, index) => {
            const isActive = index === activeIndex
            const Icon = tab.header.icon ? iconComponentFor(tab.header.icon) : undefined
            const sections = isActive ? resolveSections(tab) : []
            return (
              <div key={`${tab.header.tab}-${index}`}>
                <NavButton
                  role="tab"
                  aria-selected={isActive}
                  // Only dashboard-8-test.yaml sets header.aria_label (its visible header.tab is a single space).
                  aria-label={tab.header.aria_label}
                  aria-expanded={sections.length > 0 ? true : undefined}
                  selected={isActive}
                  icon={Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
                  onClick={(e) => {
                    onTabChange(index)
                    onClose?.()
                    dismissAfterMouse(e)
                  }}
                >
                  {tab.header.tab}
                </NavButton>
                {sections.length > 0 && expanded && (
                  <ul
                    role="group"
                    aria-label={`${tab.header.tab} sections`}
                    className="ml-[33px] mt-1 flex flex-col gap-0.5 border-l border-[var(--line)] pl-2"
                  >
                    {sections.map((section) => (
                      <li key={section.id}>
                        <button
                          type="button"
                          className="h-[30px] w-full truncate rounded-lg px-2 text-left font-body text-[13px] text-[var(--mute)] transition-colors hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
                          onClick={(e) => {
                            document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            onClose?.()
                            dismissAfterMouse(e)
                          }}
                        >
                          {section.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-2 flex flex-col gap-1 border-t border-[var(--line)] pt-2">
          <SettingsModal />
          <NavButton
            aria-label={scheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            icon={scheme === 'dark' ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
            onClick={() => setMode(scheme === 'dark' ? 'light' : 'dark')}
          >
            Light or dark
          </NavButton>
        </div>
      </nav>
    </>
  )
}
