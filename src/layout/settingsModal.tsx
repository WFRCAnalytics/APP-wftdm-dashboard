import { useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { BookOpen, Layers, Map as MapIcon, Palette, Settings, Sparkles, X } from 'lucide-react'

import { DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useScrollEdges } from '@/hooks/useScrollEdges'
import { isAssistantEnabled } from '@/state/assistantAvailability'
import { NavButton } from '@/layout/navButton'
import { AppearanceTab } from '@/layout/settings/appearanceTab'
import { ScenariosTab } from '@/layout/settings/scenariosTab'
import { BasemapTab } from '@/layout/settings/basemapTab'
import { AiTab } from '@/layout/settings/aiTab'
import { DocumentationTab } from '@/layout/settings/documentationTab'
import {
  getSettingsOpener,
  getSettingsUi,
  getShownSettingsTabs,
  setSettingsOpen,
  setSettingsTab,
  subscribe as subscribeSettings,
  type SettingsTab,
} from '@/state/settingsState'

// The Settings modal (project-docs/redesign/02-layout-and-components.md section 4, P10): a 210px rail of five tabs plus a
// Close row on the left, a scrolling body on the right, 26px radius on a --surface sheet over a blurred scrim. Built on
// the Radix Dialog primitive for the focus trap, Esc/scrim dismissal and aria-hidden of the page behind; focus moves in on
// open and returns to whatever opened it (the nav button, or the scenario picker's link). Below 900px the rail becomes a
// horizontal tab row. The tab panel unmounts when its tab is left, which is what ties the Basemap preview map's lifetime
// to the tab being visible.
const ALL_TABS: { id: SettingsTab; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'scenarios', label: 'Scenarios', icon: Layers },
  { id: 'basemap', label: 'Basemap', icon: MapIcon },
  { id: 'ai', label: 'Assistant', icon: Sparkles },
  { id: 'documentation', label: 'Documentation', icon: BookOpen },
]

const PANEL: Record<SettingsTab, () => ReactNode> = {
  appearance: () => <AppearanceTab />,
  scenarios: () => <ScenariosTab />,
  basemap: () => <BasemapTab />,
  ai: () => <AiTab />,
  documentation: () => <DocumentationTab />,
}

export function SettingsModal() {
  const ui = useSyncExternalStore(subscribeSettings, getSettingsUi)
  const railRef = useRef<HTMLDivElement>(null)
  // The body scrolls inside the rounded frame: fade its cut-off edges (re-measured when the tab changes).
  const bodyRef = useScrollEdges<HTMLDivElement>([ui.tab])
  // A deployment can switch the assistant off (state/assistantAvailability.ts, set once at boot): no tab then. Read at
  // render, not at module load, which runs before main.tsx has read the deployment's config.
  // The deployment's tab list (`settings.tabs`: which tabs, in what order); the assistant switch still wins.
  const TABS = getShownSettingsTabs()
    .map((id) => ALL_TABS.find((t) => t.id === id))
    .filter((t): t is (typeof ALL_TABS)[number] => t !== undefined && (t.id !== 'ai' || isAssistantEnabled()))

  // Roving tabindex with arrow keys, as the tab pattern asks.
  function onRailKey(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.id === ui.tab)
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
    setSettingsTab(TABS[next].id)
    railRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <DialogPrimitive.Root open={ui.open} onOpenChange={setSettingsOpen}>
      <DialogTrigger asChild>
        <NavButton icon={<Settings className="h-5 w-5" aria-hidden="true" />}>Settings</NavButton>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="z-[60] bg-[rgba(5,7,10,0.6)]" />
        <DialogPrimitive.Content
          onCloseAutoFocus={(e) => {
            const opener = getSettingsOpener()
            if (opener?.isConnected) {
              e.preventDefault()
              opener.focus()
            }
          }}
          className={cn(
            'fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 overflow-hidden outline-none',
            'h-[min(720px,94vh)] w-[min(1040px,calc(100vw-6vw))] rounded-[26px] border border-[var(--glass-line)] bg-[var(--surface)] font-body text-[var(--ink)] shadow-[var(--sh2)]',
            'grid grid-cols-[210px_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:grid-rows-[auto_minmax(0,1fr)]',
          )}
        >
          <div className="flex min-h-0 flex-col gap-[3px] border-r border-[var(--line)] bg-[var(--tile-hi)] px-3 py-[18px] max-[900px]:flex-row max-[900px]:overflow-x-auto max-[900px]:border-b max-[900px]:border-r-0 max-[900px]:py-3">
            <DialogTitle className="mx-2 mb-[14px] font-heading text-[17px] font-semibold leading-[1.45] max-[900px]:sr-only">Settings</DialogTitle>
            <DialogDescription className="sr-only">{TABS.map((t) => t.label).join(', ')}.</DialogDescription>
            <div
              ref={railRef}
              role="tablist"
              aria-label="Settings sections"
              aria-orientation="vertical"
              onKeyDown={onRailKey}
              className="flex flex-col gap-[3px] max-[900px]:flex-row"
            >
              {TABS.map(({ id, label, icon: Icon }) => {
                const selected = ui.tab === id
                return (
                  <button
                    key={id}
                    id={`settings-tab-${id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`settings-panel-${id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setSettingsTab(id)}
                    className={cn(
                      'flex h-10 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-left text-sm transition-colors motion-reduce:transition-none',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
                      selected
                        ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--sh1)]'
                        : 'text-[var(--mute)] hover:text-[var(--ink)]',
                    )}
                  >
                    <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="flex-1" />
            <DialogPrimitive.Close
              className={cn(
                'flex h-10 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-left text-sm text-[var(--mute)] transition-colors hover:text-[var(--ink)] motion-reduce:transition-none',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
              )}
            >
              <X className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
              Close
            </DialogPrimitive.Close>
          </div>
          {/* The body is inset from the rounded frame (py-3) so content never reaches its edge; a hairline appears on
              whichever side has more content beyond it, and the content itself fades into it (.scroll-frame/.scroll-fade). */}
          <div
            id={`settings-panel-${ui.tab}`}
            role="tabpanel"
            aria-labelledby={`settings-tab-${ui.tab}`}
            className="scroll-frame flex min-h-0 min-w-0 flex-col py-3"
          >
            <div ref={bodyRef} className="scrollbar-thin scroll-fade min-h-0 flex-1 overflow-auto px-7 pb-5 pt-3">
              {(TABS.some((t) => t.id === ui.tab) ? PANEL[ui.tab] : PANEL[TABS[0]?.id ?? 'appearance'])()}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}
