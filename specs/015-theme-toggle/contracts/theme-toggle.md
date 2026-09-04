# Contract: `ThemeToggle` (`src/layout/themeToggle.tsx`) + `main.tsx`'s pre-mount line

Satisfies: FR-001 through FR-011. The missing write-side counterpart to
`useColorScheme()` (`011-basemap-style-system`) — closes the gap that hook's
own header comment has documented since it was built.

## Shape

**Two parts, deliberately separated (research.md §3):** a one-line,
one-shot application in `main.tsx` that only prevents the pre-mount flash,
and the actual interactive control in `themeToggle.tsx` that owns Theme
Mode and all ongoing (post-mount) behavior. Neither part duplicates the
other — the `main.tsx` line never re-runs and establishes no listener; only
`themeToggle.tsx`'s effect does that.

### `main.tsx` (the pre-mount flash fix)

```ts
// Applied synchronously, before any `await` — see research.md §3. This is
// a ONE-SHOT application only: it exists solely so the very first paint
// (which happens well before React mounts, since initDuckDB()/
// discoverScenarios()/loadDashboards() all run first) already matches the
// OS preference. It establishes no ongoing tracking of its own — that's
// themeToggle.tsx's job once it mounts, moments later.
document.documentElement.classList.toggle(
  'dark',
  window.matchMedia('(prefers-color-scheme: dark)').matches,
)

await initDuckDB()
await discoverScenarios()
const dashboards = await loadDashboards()
// ...unchanged from here down
```

### `themeToggle.tsx` (the control)

**Revised from the originally-shipped shape** (research.md §6): the first
version used three always-visible `Tabs`/`TabsTrigger` buttons; reversed
immediately after shipping, based on real user feedback, not a defect —
`ScenarioLoader` (this control's own header neighbor) is variable-width in
WEB deployment mode, so three permanently-reserved buttons next to it was a
real crowding risk. Now an icon-only `DropdownMenu` trigger.

```tsx
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

export type ThemeMode = 'system' | 'light' | 'dark'

const MODE_ICON: Record<ThemeMode, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon }
const MODE_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' }

// Dashboard-wide, not panel-specific — mounted once in shell.tsx's header
// (research.md §7), same category of control as ScenarioLoader. No shared/
// global store: no other component ever needs to read Theme Mode itself,
// only the resolved effective theme, which every existing and future
// consumer already gets from useColorScheme() unchanged (research.md §4).
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('system')

  // The one effect that both resolves+applies the effective theme AND
  // manages the matchMedia listener's own lifecycle, scoped to `mode` via
  // the dependency array and this effect's own cleanup function — the
  // Decision spec.md's Assumptions committed to and research.md §5
  // formalizes with its full Rationale/Alternatives-considered. Listener
  // is attached ONLY while mode === 'system' and is torn down (React's own
  // cleanup) on every transition away from System, never left attached
  // with an internal no-op guard. UNCHANGED by the control-shape revision
  // below — this effect never depended on how `mode` is displayed/selected.
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
        {/* Icon-only — aria-label (not a Tooltip, research.md §6's
            rejected-alternative) conveys the current mode to assistive
            tech; the icon itself already changes per mode, satisfying
            FR-008 at a glance with no click needed. */}
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
```

(Illustrative — the load-bearing contract is: exactly one effect owns all
DOM-class writes for this component, keyed on `mode`, and is entirely
independent of the control's own visual shape; the trigger's own icon plus
the menu's `DropdownMenuRadioItem` checkmark satisfy FR-008 with no extra
markup; no `localStorage`/`sessionStorage`/cookie/URL read or write
anywhere in this component — `mode` always starts at `'system'` on mount,
satisfying FR-003/FR-007 by construction, not by an explicit reset step.)

### `shell.tsx` (placement — research.md §7)

```tsx
<header className="flex items-center justify-between border-b border-border px-6 py-4">
  <NavBar tabs={dashboards} activeTab={active.header.tab} onTabChange={setActiveTab} />
  <div className="flex items-center gap-3">
    <ScenarioLoader />
    <ThemeToggle />
  </div>
</header>
```

## Given/When/Then

- **Given** a browser reporting `prefers-color-scheme: dark`, **when** the
  app is loaded fresh, **then** `document.documentElement` carries the
  `dark` class before `ReactDOM.createRoot(...).render()` is ever called
  (the `main.tsx` line), and remains `dark` once `ThemeToggle` mounts with
  `mode === 'system'` (US1 Scenario 1, FR-003).
- **Given** a browser reporting `prefers-color-scheme: light`, **when** the
  app is loaded fresh, **then** `document.documentElement` never carries the
  `dark` class at any point (US1 Scenario 2).
- **Given** the app is open with `mode === 'system'`, **when** the OS-level
  preference changes, **then** `document.documentElement`'s `dark` class
  updates within one `matchMedia` `'change'` event, no reload (US1 Scenario
  3, FR-004).
- **Given** the app is showing the system-matched theme, **when** the
  viewer selects "Light" (or "Dark"), **then** the `dark` class is set
  immediately to match that explicit choice, and the System-mode
  `matchMedia` listener from the prior render is torn down (US2 Scenario 1,
  FR-005).
- **Given** the viewer has selected "Dark", **when** the OS-level
  preference subsequently changes, **then** `document.documentElement`'s
  class is unaffected — no listener is attached to react to it at all while
  `mode !== 'system'` (US2 Scenario 2, FR-005, research.md §5).
- **Given** a mounted `GraphicWalkerPanel` (or any future
  `useColorScheme()` consumer), **when** the viewer toggles `mode`,
  **then** that panel restyles in the same render pass with no code change
  of its own, and its own in-progress local state (a field already on a
  shelf) survives unchanged (US2 Scenario 3, FR-009/FR-011).
- **Given** the viewer has manually selected "Light" or "Dark", **when**
  the viewer selects "System" again, **then** the app immediately resolves
  to the current live OS preference and a fresh `matchMedia` listener
  begins tracking further changes (US3 Scenario 1).
- **Given** the toggle control, **when** inspected at any time, **then**
  the trigger button's own icon (and `aria-label`) reflects the current
  `mode`, and opening the menu shows exactly one `DropdownMenuRadioItem`
  checked, matching `mode` (US3 Scenario 2, FR-008; revised from the
  originally-shipped `TabsTrigger` active-state styling — research.md §6).
- **Given** a manual override is active, **when** the page is reloaded,
  **then** `ThemeToggle` remounts with `mode === 'system'` and the app
  reflects the current OS preference — the override does not survive
  (Edge Cases, FR-006/FR-007, constitution Principle VI).

## Non-goals for this feature

- No persistence of Theme Mode anywhere — not `localStorage`, not
  `sessionStorage`, not a cookie, not a URL query parameter (spec.md
  Assumptions explicitly considered and rejected the URL-param route as
  disproportionate scope).
- No cross-tab synchronization (`BroadcastChannel` or otherwise) — each
  tab's `ThemeToggle` instance is fully independent (spec.md Assumptions).
- No change to `useColorScheme.ts`, `tokens.css`, or `tailwind.config.js` —
  this feature is purely the write side of an already-complete system
  (research.md §1/§2).
- No true Radix `Switch` — strictly binary, cannot represent "System" as a
  third state at all (research.md §6).
