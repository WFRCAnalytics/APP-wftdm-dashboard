import { useState, type ReactNode } from 'react'
import { BookOpen, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react'

import { docsHref, docsLabel, listedPages } from '@/config'

import { DashboardBrand, DashboardMark } from '@/layout/dashboardBrand'
import { NAV_ICON_ROW_CLASS, NavButton, NavLink } from '@/layout/navButton'
import { Segmented, type SegmentedOption } from '@/components/ui/segmented'
import { SettingsModal } from '@/layout/settingsModal'
import { iconComponentFor } from '@/lib/iconComponentFor'
import { useThemeMode } from '@/hooks/useThemeMode'
import { useLayoutVersion } from '@/state/layoutState'
import { setMode, type ThemeMode } from '@/state/themeState'
import { cn } from '@/lib/utils'
import type { DashboardTabConfig } from '@/layout/types'
import type { DashboardBranding } from '@/services/yamlLoader'
import { prettyOperators } from '@/services/typography'

// The floating navigation (project-docs/redesign/02-layout-and-components.md §1.1). A glass rail fixed at the left edge:
// 68px wide, 248px once its labels are pinned open with the toggle. Pinned, the shell docks the page beside it (the canvas
// shrinks to the space that is left); while keyboard focus is inside the rail it also shows labels, as a transient overlay
// that never moves the page. It never expands on hover: the rail moving while the pointer aims at an item was the problem.
// The tab list is still YAML-driven and keeps its role="tablist"/"tab" contract. A page's `sections:` are not listed here:
// the page shows them as its own tab strip. Pinned open, the footer controls sit in one row of icon buttons.
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
  /** The page's scenario list, shown under the pages while the labels are pinned open (scenarios.placement). */
  scenarioList?: ReactNode
}

// The theme control. Expanded, it is a three-part pill (System / Light / Dark icons, the set one filled); collapsed, the
// rail has no room for that, so it is one button that cycles System -> Light -> Dark and shows the mode that is set (the
// Settings modal offers the same three). A System pick follows the OS live, so the icon is the mode, not the scheme in effect.
const THEME_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const NEXT_THEME: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_GLYPH: Record<ThemeMode, ReactNode> = {
  system: <Monitor className="h-4 w-4" aria-hidden="true" />,
  light: <Sun className="h-4 w-4" aria-hidden="true" />,
  dark: <Moon className="h-4 w-4" aria-hidden="true" />,
}
// Collapsed, the set mode is drawn exactly as the expanded pill draws its selected part: a 30px .pill-on fill (brand,
// icon knocked out) inside a 36px .pill-track, i.e. one slice of the pill, so the two states read as one control. The
// circle overflows the 20px icon slot evenly (-8px) to stay centred on the rail.
const THEME_ICON: Record<ThemeMode, ReactNode> = Object.fromEntries(
  (Object.keys(THEME_GLYPH) as ThemeMode[]).map((m) => [
    m,
    <span key={m} className="pill-track -m-[8px] grid h-[36px] w-[36px] shrink-0 place-items-center rounded-full">
      <span className="pill-on grid h-[30px] w-[30px] place-items-center rounded-full">{THEME_GLYPH[m]}</span>
    </span>,
  ]),
) as Record<ThemeMode, ReactNode>
const THEME_PILL_OPTIONS: SegmentedOption[] = (['system', 'light', 'dark'] as ThemeMode[]).map((m) => ({
  id: m,
  label: THEME_LABEL[m],
  icon: THEME_GLYPH[m],
}))

// What stands in for the logo when none is configured or it fails to load: a hamburger tile on the collapsed rail and a
// short "Menu" label (with the same icon) when it is expanded, never the organisation's long title or an unrelated glyph.
const MENU_MARK = (
  <span
    aria-hidden="true"
    className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px] bg-[var(--brand)] shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_6px_14px_-6px_var(--brand)]"
  >
    <Menu className="h-[19px] w-[19px] text-[var(--primary-foreground)]" strokeWidth={2.4} />
  </span>
)
const MENU_LABEL = (
  <span className="dashboard-brand-title inline-flex items-center gap-2 whitespace-nowrap font-heading text-xl font-semibold tracking-tight text-foreground">
    <Menu className="h-5 w-5" aria-hidden="true" />
    Menu
  </span>
)

export function FloatingNav({ tabs, activeIndex, onTabChange, branding, mobile = false, open = false, onClose, pinned = false, onPinnedChange, docsPath, scenarioList }: FloatingNavProps) {
  // Keyboard focus inside the rail shows the labels as a transient overlay; the toggle pins them open (state lives in the
  // shell, which docks the page beside a pinned nav).
  const [engaged, setEngaged] = useState(false)
  const themeMode = useThemeMode()
  useLayoutVersion()
  const expanded = mobile ? open : pinned || engaged
  // The theme pill only when the labels are pinned open (or the mobile sheet is open), never for the keyboard-focus overlay:
  // moving focus off the theme button there would collapse the rail.
  const showThemePill = mobile ? open : false
  // pinned open on a desktop the footer is one row of icon buttons (theme, documentation, settings, labels)
  const footerRow = !mobile && pinned
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
        {/* Branding, all deployer-configured (dashboard-config.yaml: `logo`, `mark`). Collapsed shows the abbreviated mark (markUrl);
            expanded replaces it with the full logo (logoUrl). The mark never sits beside the logo. Where either is unset or fails to
            load, a hamburger tile (collapsed) or a short "Menu" label (expanded) stands in. */}
        <div className="mb-[14px] min-h-[46px] overflow-hidden px-[3px]">
          <div className="grid min-h-[46px] items-center">
            <div
              aria-hidden={expanded}
              className={cn('col-start-1 row-start-1 flex items-center transition-opacity duration-150', expanded ? 'pointer-events-none opacity-0' : 'opacity-100')}
            >
              <DashboardMark branding={branding} fallback={MENU_MARK} />
            </div>
            <div
              aria-hidden={!expanded}
              className={cn('col-start-1 row-start-1 flex min-w-0 justify-center transition-opacity duration-150', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}
            >
              <DashboardBrand branding={branding} fallback={MENU_LABEL} />
            </div>
          </div>
        </div>

        {/* Top-aligned: the pages, then the scenario list straight under them; the free space sits above the footer. A long
            page list scrolls past about half the rail so the scenarios stay on screen. */}
        <div role="tablist" aria-orientation="vertical" className={cn('scrollbar-thin flex min-h-0 flex-col gap-1.5 overflow-y-auto overflow-x-hidden', scenarioList && pinned && !mobile && 'max-h-[55%]')}>
          {tabs.map((tab, index) => {
            if (!listed.has(index)) return null
            const isActive = index === activeIndex
            const Icon = tab.header.icon ? iconComponentFor(tab.header.icon) : undefined
            return (
              <div key={`${tab.header.tab}-${index}`}>
                <NavButton
                  role="tab"
                  aria-selected={isActive}
                  // Only dashboard-8-test.yaml sets header.aria_label (its visible header.tab is a single space).
                  aria-label={tab.header.aria_label}
                  selected={isActive}
                  icon={Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
                  title={expanded ? undefined : tab.header.tab}
                  onClick={() => {
                    onTabChange(index)
                    onClose?.()
                  }}
                >
                  {prettyOperators(tab.header.tab)}
                </NavButton>
              </div>
            )
          })}
        </div>

        {scenarioList && pinned && !mobile && (
          <div className="mt-2 flex min-h-0 shrink flex-col border-t border-[var(--line)] pt-3">{scenarioList}</div>
        )}
        <div aria-hidden="true" className="min-h-0 flex-1" />

        <div className={cn('mt-2 flex flex-col gap-1 border-t border-[var(--line)] pt-2', footerRow && NAV_ICON_ROW_CLASS)}>
          {/* Both are always rendered in the same 48px slot and cross-fade, in step with the rail's 220ms width transition.
              The pill has a fixed width, so the widening rail reveals it (overflow is clipped) instead of squeezing three
              parts into 48px. The hidden one is `inert`: out of the tab order and the accessibility tree. */}
          <div className="relative h-12">
            <div
              ref={(el) => { if (el) el.inert = !showThemePill }}
              className={cn(
                'absolute inset-y-0 left-1 flex items-center transition-opacity',
                mobile ? 'right-1' : 'w-[220px]',
                showThemePill ? 'opacity-100 delay-75 duration-200' : 'pointer-events-none opacity-0 duration-100',
              )}
            >
              <Segmented
                label="Theme"
                fill
                // each part 30px tall, the same as the collapsed rail's filled bubble, so the selected mode is one size in both states
                className="[&>button]:h-[30px] [&>button]:py-0"
                options={THEME_PILL_OPTIONS}
                value={themeMode}
                onChange={(id) => setMode(id as ThemeMode)}
              />
            </div>
            <div
              ref={(el) => { if (el) el.inert = showThemePill }}
              className={cn(
                'absolute inset-0 transition-opacity',
                showThemePill ? 'pointer-events-none opacity-0 duration-100' : 'opacity-100 delay-75 duration-200',
              )}
            >
              <NavButton
                aria-label={`Theme: ${THEME_LABEL[themeMode]}. Switch to ${THEME_LABEL[NEXT_THEME[themeMode]]}`}
                title={`Theme: ${THEME_LABEL[themeMode]}. Switch to ${THEME_LABEL[NEXT_THEME[themeMode]]}`}
                // in the footer row it is a plain icon like its neighbours; in the collapsed column the filled bubble
                icon={footerRow ? THEME_GLYPH[themeMode] : THEME_ICON[themeMode]}
                onClick={() => setMode(NEXT_THEME[themeMode])}
              >
                Theme: {THEME_LABEL[themeMode]}
              </NavButton>
            </div>
          </div>
          {documentation && (
            <NavLink href={documentation} title={docsLabel(branding.docsLabel)} icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}>
              {docsLabel(branding.docsLabel)}
            </NavLink>
          )}
          <SettingsModal />
          {!mobile && (
            <NavButton
              aria-label={pinned ? 'Hide menu labels' : 'Show menu labels'}
              aria-expanded={pinned}
              title={pinned ? 'Hide labels' : 'Show menu labels'}
              icon={pinned ? <PanelLeftClose className="h-5 w-5" aria-hidden="true" /> : <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />}
              onClick={() => onPinnedChange?.(!pinned)}
            >
              {pinned ? 'Hide labels' : 'Show labels'}
            </NavButton>
          )}
        </div>
      </nav>
    </>
  )
}
