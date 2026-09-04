import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// 015-theme-toggle: the missing write-side counterpart to
// useColorScheme() (011-basemap-style-system) — that hook's own header
// comment has anticipated this exact feature since it was built. Dashboard-
// wide, not panel-specific — mounted once in shell.tsx's header, alongside
// ScenarioLoader (research.md §7). No shared/global store: no other
// component ever needs to read Theme Mode itself, only the resolved
// effective theme, which every existing and future consumer already gets
// from useColorScheme() unchanged (research.md §4) — this component never
// imports that hook at all.
//
// Icon-only dropdown trigger, not the original three-always-visible-button
// Tabs control (contracts/theme-toggle.md's original sketch) — revised
// after shipping, following real user feedback: ScenarioLoader (this
// control's own header neighbor) is variable-width in WEB deployment mode
// (grows by one chip per locally-loaded scenario), so a compact, single-
// button trigger keeps the header from getting visually tight/wrapping
// awkwardly the way three always-visible buttons could. A true Radix
// Switch was considered and rejected: it's strictly binary and cannot
// represent "System" as a third state at all, which would silently
// collapse this feature's whole three-state rationale (spec.md
// Assumptions — a two-state control can't distinguish "following the
// system" from "I overrode it and it happens to match," which matters
// even more given a manual override can't survive a reload at all).
export type ThemeMode = 'system' | 'light' | 'dark'

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

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('system')

  // The one effect that both resolves+applies the effective theme AND
  // manages the matchMedia listener's own lifecycle, scoped to `mode` via
  // the dependency array and this effect's own cleanup function — the
  // Decision spec.md's Assumptions committed to and research.md §5
  // formalizes with its full Rationale/Alternatives-considered. The
  // listener is attached ONLY while mode === 'system' and is torn down
  // (React's own cleanup) on every transition away from System, never left
  // attached with an internal no-op guard — avoids a stale-closure hazard
  // that shape would otherwise need a ref to work around.
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

  const TriggerIcon = MODE_ICON[mode]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Ghost, not outline — the user's own pick after comparing 5 real
            prototypes (see research.md §6's "Final shape chosen" note): no
            border until hovered/opened, so it carries the least visual
            weight of the compared options next to ScenarioLoader's own
            bordered button. aria-label (not a Tooltip) conveys the current
            mode to assistive tech, avoiding the same Tooltip-on-an-
            interactive-trigger composition risk ScenarioLoader's own
            header comment already documents finding once (Radix
            Tooltip.Root throwing without an ancestor Provider); a visible
            label isn't needed here since the icon itself already changes
            per mode, satisfying FR-008's "visibly indicate which mode is
            active" at a glance. */}
        <Button variant="ghost" size="icon" aria-label={`Theme: ${MODE_LABEL[mode]}`}>
          <TriggerIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
          {(Object.keys(MODE_LABEL) as ThemeMode[]).map((m) => {
            const Icon = MODE_ICON[m]
            return (
              <DropdownMenuRadioItem key={m} value={m}>
                <Icon className="h-4 w-4" />
                {MODE_LABEL[m]}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
