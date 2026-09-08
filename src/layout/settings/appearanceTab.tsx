import { useEffect } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useThemeMode } from '@/hooks/useThemeMode'
import { setMode, type ThemeMode } from '@/state/themeState'

// 020-settings-modal: relocated from layout/themeToggle.tsx (deleted by
// this feature) — the mount/mode effect (applying `.dark` to
// document.documentElement, managing the matchMedia listener's lifecycle)
// is reused completely UNCHANGED (FR-004). The only thing that changes is
// presentation: three directly visible options instead of themeToggle.tsx's
// own later DropdownMenu redesign. That redesign was driven specifically
// by header-crowding next to ScenarioLoader's own variable width in the
// shared header row (see themeToggle.tsx's own former header comment,
// quoted in research.md §9) — a constraint that doesn't exist inside this
// modal tab's own dedicated body. A true Radix Switch remains rejected for
// the same reason themeToggle.tsx's own comment already recorded: strictly
// binary, cannot represent "System" as a third state.
//
// UI polish pass (post-merge correction): `mode` itself is no longer local
// useState — confirmed directly (live Playwright reproduction) that
// switching Settings tabs away from Appearance and back genuinely
// unmounts/remounts this component (Radix Tabs tears down inactive
// content), which was silently resetting a Light/Dark choice back to
// System on every round trip. Now sourced from state/themeState.ts
// (module-level, survives the remount) via hooks/useThemeMode.ts — see
// that module's own comment for the full finding. Re-exports ThemeMode
// from state/themeState.ts unchanged so no other import site needs to
// change.
//
// 024-settings-modal-visual-redesign (US4): rebuilt on this app's shared
// Tabs/TabsList/TabsTrigger primitive (already used by settingsModal.tsx's
// own outer navigation) instead of a plain <Button> row — a real
// keyboard-navigable, role="tab" control instead of three independently-
// clickable buttons. `mode`/`setMode()` wiring and the mount/matchMedia
// effect below are UNCHANGED — only the rendered control shape changes
// (research.md §5, data-model.md). No `orientation` prop is passed, so
// this renders horizontally (Tabs' own default orientation).
//
// This nests a SECOND role="tablist" region inside settingsModal.tsx's own
// outer one while the modal is open on this tab. Distinguished via
// aria-label — this TabsList is "Theme" (the exact label the previous
// plain `role="group"` wrapper already used, so the accessible name a
// screen-reader user hears does not change across this rebuild),
// settingsModal.tsx's own outer TabsList is "Settings sections"
// (research.md §3, FR-013). Confirmed via direct grep of this project's
// own test suite that no existing query relies on an unscoped, name-less
// tablist/tab lookup against this modal — every existing by-name query
// ("Appearance"/"Scenarios"/"Basemap"/"Documentation" vs. "System"/
// "Light"/"Dark") already resolves unambiguously since the two sets of
// names are disjoint; only the assertions that queried System/Light/Dark
// by role="button"+aria-pressed needed migrating to role="tab"+
// aria-selected (settingsModal.spec.ts, this feature's own test changes).
export type { ThemeMode } from '@/state/themeState'

const MODE_ICON: Record<ThemeMode, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

const MODE_LABEL: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

const MODES: ThemeMode[] = ['system', 'light', 'dark']

// 030-sidebar-navigation, FR-006: the "Top Bar Behavior" control (Hide on
// Scroll / Always Visible) that used to live below the Theme control on
// this same tab is REMOVED entirely, not adapted — its own underlying
// nav-bar visibility mode (hooks/useNavBarVisibilityMode.ts,
// state/navBarVisibilityState.ts) no longer exists at all: a Sidebar-based
// layout has no position: fixed header to hide/show in the first place
// (research.md §5).
export function AppearanceTab() {
  const mode = useThemeMode()

  // Unchanged from themeToggle.tsx — see that file's own former comment
  // (now research.md §5/§9) for the full rationale: attached only while
  // mode === 'system', torn down on every transition away, to avoid a
  // stale-closure hazard a lifetime-attached listener would otherwise need
  // a ref to work around.
  useEffect(() => {
    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const apply = () => document.documentElement.classList.toggle('dark', mq.matches)
      apply()
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
    document.documentElement.classList.toggle('dark', mode === 'dark')
    return undefined
  }, [mode])

  return (
    <div className="space-y-6">
      {/* A visible text label above the control itself — previously this
          control's only name was its aria-label ("Theme"), fine for
          assistive tech but leaving nothing on screen distinguishing it
          once a second control (below) exists on the same tab. Added here
          rather than left implicit, matching this feature's own explicit
          "clear label distinguishing it from the theme control" ask for
          the new control below — parity between the two, not one labeled
          and one not. */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">Theme</div>
        <Tabs value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
          <TabsList aria-label="Theme">
            {MODES.map((m) => {
              const Icon = MODE_ICON[m]
              return (
                <TabsTrigger key={m} value={m} className="gap-1.5">
                  <Icon className="h-4 w-4" />
                  {MODE_LABEL[m]}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}
