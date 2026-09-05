import { useEffect } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
    <div className="flex items-center gap-2" role="group" aria-label="Theme">
      {MODES.map((m) => {
        const Icon = MODE_ICON[m]
        const selected = mode === m
        return (
          <Button
            key={m}
            type="button"
            variant={selected ? 'secondary' : 'outline'}
            aria-pressed={selected}
            onClick={() => setMode(m)}
          >
            <Icon className="h-4 w-4" />
            {MODE_LABEL[m]}
          </Button>
        )
      })}
    </div>
  )
}
