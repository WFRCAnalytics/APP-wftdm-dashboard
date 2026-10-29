import { useState, type ReactNode } from 'react'
import { BookOpen, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react'

import { docsHref, docsLabel, listedPages } from '@/config'

import { DashboardBrand, DashboardMark, hasConfiguredLogo } from '@/layout/dashboardBrand'
import { NavButton, NavLink } from '@/layout/navButton'
import { SettingsModal } from '@/layout/settingsModal'
import { resolveSections } from '@/layout/dashboardLayout'
import { iconComponentFor } from '@/lib/iconComponentFor'
import { useThemeMode } from '@/hooks/useThemeMode'
import { useColorScheme } from '@/hooks/useColorScheme'
import { useTabsPlan } from '@/hooks/useTabsPlan'
import { getActiveSection, setActiveSection, useLayoutVersion } from '@/state/layoutState'
import { setMode, type ThemeMode } from '@/state/themeState'
import { cn } from '@/lib/utils'
import type { DashboardTabConfig } from '@/layout/types'
import type { DashboardBranding } from '@/services/yamlLoader'

// The floating navigation (project-docs/redesign/02-layout-and-components.md §1.1). A glass rail fixed at the left edge:
// 68px wide, 248px once its labels are pinned open with the toggle. Pinned, the shell docks the page beside it (the canvas
// shrinks to the space that is left); while keyboard focus is inside the rail it also shows labels, as a transient overlay
// that never moves the page. It never expands on hover: the rail moving while the pointer aims at an item was the problem.
// The tab list is still YAML-driven and keeps its role="tablist"/"tab" contract; the selected tab shows its `sections:` as
// a sub-list.
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
  /** Labels pinned open with the toggle. Owned by the shell, which also shrinks the page beside a pinned nav. */
  pinned?: boolean
  onPinnedChange?: (pinned: boolean) => void
  /** The open page's `header.docs`, appended to `branding.docsUrl` for the documentation link (none on a chromeless page). */
  docsPath?: string
}

// The theme button cycles System -> Light -> Dark and always shows the mode that is set (the Settings modal offers the
// same three). A System pick follows the OS live, so the icon is the mode, not the scheme currently in effect.
const THEME_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const NEXT_THEME: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_ICON: Record<ThemeMode, ReactNode> = {
  system: <Monitor className="h-5 w-5" aria-hidden="true" />,
  light: <Sun className="h-5 w-5" aria-hidden="true" />,
  dark: <Moon className="h-5 w-5" aria-hidden="true" />,
}

// The app's own mark, used wherever the deployer has not configured a `markUrl`.
const GENERIC_MARK = (
  <span
    aria-hidden="true"
    className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px] bg-[var(--brand)] shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_6px_14px_-6px_var(--brand)]"
  >
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="var(--primary-foreground)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18 9 9l4 6 3-5 4 8" />
    </svg>
  </span>
)

export function FloatingNav({ tabs, activeIndex, onTabChange, branding, mobile = false, open = false, onClose, pinned = false, onPinnedChange, docsPath }: FloatingNavProps) {
  // Keyboard focus inside the rail shows the labels as a transient overlay; the toggle pins them open (state lives in the
  // shell, which docks the page beside a pinned nav).
  const [engaged, setEngaged] = useState(false)
  const themeMode = useThemeMode()
  const colorScheme = useColorScheme()
  useLayoutVersion()
  const activePlan = useTabsPlan(tabs[activeIndex])
  const expanded = mobile ? open : pinned || engaged
  const documentation = docsHref(branding.docsUrl, docsPath)
  // hidden pages are not listed; the indices stay those of the full list (see the shell)
  const listed = new Set(listedPages(tabs.map((t) => t.header)))

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
        // Only keyboard focus expands the nav: a mouse press also focuses the button, and expanding then would insert the
        // sub-list between mousedown and mouseup and shift the target out from under the click.
        onFocus={(e) => {
          if (e.target.matches(':focus-visible')) setEngaged(true)
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEngaged(false)
        }}
      >
        {/* Branding, all deployer-configured (dashboard-config.yaml: `logo`, `mark`). Collapsed shows the abbreviated mark (markUrl, or
            the generic mark when none is set); expanded replaces it with the full logo (logoUrl) or, with no logo, the title
            text. The mark never sits beside either. With neither a logo nor a title there is nothing to swap in, so the mark
            stays. */}
        <div className="mb-[14px] min-h-[46px] overflow-hidden px-[3px]">
          {hasConfiguredLogo(branding, colorScheme) || branding.title ? (
            <div className="grid min-h-[46px] items-center">
              <div
                aria-hidden={expanded}
                className={cn('col-start-1 row-start-1 flex items-center transition-opacity duration-150', expanded ? 'pointer-events-none opacity-0' : 'opacity-100')}
              >
                <DashboardMark branding={branding} fallback={GENERIC_MARK} />
              </div>
              <div
                aria-hidden={!expanded}
                className={cn('col-start-1 row-start-1 flex min-w-0 justify-center transition-opacity duration-150', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}
              >
                <DashboardBrand branding={branding} />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[46px] items-center">
              <DashboardMark branding={branding} fallback={GENERIC_MARK} />
            </div>
          )}
        </div>

        <div role="tablist" aria-orientation="vertical" className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
          {tabs.map((tab, index) => {
            if (!listed.has(index)) return null
            const isActive = index === activeIndex
            const Icon = tab.header.icon ? iconComponentFor(tab.header.icon) : undefined
            const tabsPlan = isActive ? activePlan : null
            const sections = isActive ? (tabsPlan ? tabsPlan.sections : resolveSections(tab)) : []
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
                  title={expanded ? undefined : tab.header.tab}
                  onClick={() => {
                    onTabChange(index)
                    onClose?.()
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
                          aria-current={tabsPlan && getActiveSection(tab.header.tab) === section.id ? 'true' : undefined}
                          onClick={() => {
                            if (tabsPlan) setActiveSection(tab.header.tab, section.id)
                            else document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            onClose?.()
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
          {!mobile && (
            <NavButton
              aria-label={pinned ? 'Hide menu labels' : 'Show menu labels'}
              aria-expanded={pinned}
              title={expanded ? undefined : 'Show menu labels'}
              icon={pinned ? <PanelLeftClose className="h-5 w-5" aria-hidden="true" /> : <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />}
              onClick={() => onPinnedChange?.(!pinned)}
            >
              {pinned ? 'Hide labels' : 'Show labels'}
            </NavButton>
          )}
          {documentation && (
            <NavLink href={documentation} icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}>
              {docsLabel(branding.docsLabel)}
            </NavLink>
          )}
          <SettingsModal />
          <NavButton
            aria-label={`Theme: ${THEME_LABEL[themeMode]}. Switch to ${THEME_LABEL[NEXT_THEME[themeMode]]}`}
            icon={THEME_ICON[themeMode]}
            onClick={() => setMode(NEXT_THEME[themeMode])}
          >
            Theme: {THEME_LABEL[themeMode]}
          </NavButton>
        </div>
      </nav>
    </>
  )
}
