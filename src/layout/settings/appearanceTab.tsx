import { useEffect } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { useThemeMode } from '@/hooks/useThemeMode'
import { setMode, type ThemeMode } from '@/state/themeState'
import { useColorblindSafePreference } from '@/hooks/useColorblindSafePreference'
import { setColorblindSafe } from '@/state/colorPreferenceState'
import { useTextSize } from '@/hooks/useTextSize'
import { setScale } from '@/state/textSizeState'
import { useInterfaceColors } from '@/hooks/useInterfaceColors'
import { InterfaceColorControl } from '@/layout/settings/interfaceColorControl'
import { useFontPreference } from '@/hooks/useFontPreference'
import { clearFont, setFont, type FontRole } from '@/state/fontPreferenceState'
import { clearGoogleFont, ensureGoogleFontLoaded } from '@/panels/googleFontLoader'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

// 061-appearance-controls (US4): a small, bundled shortlist for
// discoverability — free-text entry (via the <input list="...">
// combo-box pattern below) already offers the same "any Google Font"
// breadth this shortlist alone doesn't limit (research.md §9); no
// Developer API key is needed to populate it.
const GOOGLE_FONT_SHORTLIST = [
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Source Sans Pro',
  'Merriweather',
  'Playfair Display',
  'Nunito',
  'Raleway',
  'Ubuntu',
  'Rubik',
  'Work Sans',
  'Inter',
  'Mulish',
  'Quicksand',
  'Karla',
  'DM Sans',
  'Fira Sans',
  'PT Sans',
  'Noto Sans',
  'Josefin Sans',
  'Oswald',
  'Libre Baskerville',
  'Crimson Text',
  'IBM Plex Sans',
  'Fira Code',
  'JetBrains Mono',
  'Space Mono',
  'Source Code Pro',
]

const FONT_ROLE_LABEL: Record<FontRole, string> = {
  body: 'Body',
  heading: 'Heading',
  mono: 'Monospace',
}

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
  // 061-appearance-controls
  const colorblindSafe = useColorblindSafePreference()
  const textSize = useTextSize()
  const interfaceColors = useInterfaceColors()
  const fontPreference = useFontPreference()

  // US2: applies the current text-size scale live — every Tailwind
  // rem-based interface element resizes proportionally through the
  // ordinary CSS cascade, with no per-component change (research.md §10).
  useEffect(() => {
    document.documentElement.style.fontSize = `${textSize}%`
  }, [textSize])

  // US3: applies each role's resolved color + auto-computed foreground
  // live via an inline custom-property override on document.documentElement
  // — inline styles beat any :root/.dark stylesheet rule regardless of
  // theme (research.md §10). `color: undefined` means "nothing configured
  // for this role" — removeProperty() lets tokens.css's own theme-paired
  // value apply through the ordinary cascade instead. A deployer-
  // configured default is ALSO applied once, at boot, directly in
  // main.tsx (mirroring theme-mode's own one-shot dark-class line) — this
  // effect re-applying the identical value on mount is a harmless no-op;
  // it's what makes a viewer's own LATER session override take effect
  // live, the same division of responsibility theme-mode already has
  // between its boot-time line and this component's own effect.
  useEffect(() => {
    const root = document.documentElement
    for (const role of ['primary', 'secondary', 'accent'] as const) {
      const { color, foreground } = interfaceColors[role]
      if (color && foreground) {
        root.style.setProperty(`--${role}`, color)
        root.style.setProperty(`--${role}-foreground`, foreground)
      } else {
        root.style.removeProperty(`--${role}`)
        root.style.removeProperty(`--${role}-foreground`)
      }
    }
  }, [interfaceColors])

  // US4: reacts to a font-preference change by loading (or clearing) that
  // role's Google Font — the one place state changes turn into the actual
  // <link>/--font-* DOM side effect (panels/googleFontLoader.ts), mirroring
  // the interface-color effect above's own state-drives-DOM shape.
  useEffect(() => {
    for (const role of ['body', 'heading', 'mono'] as const) {
      const name = fontPreference[role]
      if (name) {
        ensureGoogleFontLoaded(role, name)
      } else {
        clearGoogleFont(role)
      }
    }
  }, [fontPreference])

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

      {/* 061-appearance-controls (US1): a single, dashboard-wide switch —
          changes only the DEFAULT palette both the category-color
          resolver (panels/chartColor.ts) and the scenario-color chain
          (panels/scenarioDisplay.ts) fall back to when nothing more
          specific (an author's own color_scheme:, a scenario's own
          colorOverride/deployer scenarioPalette) is already configured —
          see contracts/category-color-resolution.md. */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <label htmlFor="colorblind-safe-toggle" className="text-sm font-medium text-foreground">
            Prefer colorblind-safe palettes
          </label>
          <p className="text-xs text-muted-foreground">
            Uses colorblind-safe colors as the default for charts and scenarios that don't already
            have a specific color configured.
          </p>
        </div>
        <Switch
          id="colorblind-safe-toggle"
          checked={colorblindSafe}
          onCheckedChange={setColorblindSafe}
        />
      </div>

      {/* 061-appearance-controls (US2): a continuous slider scaling
          document.documentElement's root font size — every Tailwind
          rem-based interface element scales with it automatically
          (research.md §10). Deliberately does not affect text drawn
          directly inside a chart's own SVG/D3 render call (FR-012). */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="text-size-slider" className="text-sm font-medium text-foreground">
            Text size
          </label>
          <span className="text-xs text-muted-foreground">{textSize}%</span>
        </div>
        <Slider
          id="text-size-slider"
          aria-label="Text size"
          min={80}
          max={150}
          step={5}
          value={[textSize]}
          onValueChange={([next]) => setScale(next)}
        />
      </div>

      {/* 061-appearance-controls (US3): Primary/Secondary/Accent —
          two-tier (deployer default, applied once at boot in main.tsx,
          plus a viewer session override on top) color resolution, no
          separate "brand" entity (spec.md's own Assumptions). */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-foreground">Colors</div>
        <InterfaceColorControl role="primary" label="Primary" />
        <InterfaceColorControl role="secondary" label="Secondary" />
        <InterfaceColorControl role="accent" label="Accent" />
      </div>

      {/* 061-appearance-controls (US4): body/heading/monospace font
          pickers — a free-text-capable combo box (native <input
          list="...">) seeded with a small bundled shortlist, since a
          viewer choosing "any Google Font" needs no enumerated catalog
          fetch to do so (research.md §9). Defaults to this dashboard's
          existing self-hosted Geist typefaces (empty input, no
          selection) — picking a name is fully optional. */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-foreground">Fonts</div>
        {(['body', 'heading', 'mono'] as const).map((role) => (
          <div key={role} className="space-y-1">
            <label htmlFor={`font-picker-${role}`} className="text-xs text-muted-foreground">
              {FONT_ROLE_LABEL[role]}
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`font-picker-${role}`}
                list={`google-fonts-${role}`}
                placeholder="Default"
                value={fontPreference[role] ?? ''}
                onChange={(e) => {
                  const value = e.target.value
                  if (value.trim()) setFont(role, value)
                  else clearFont(role)
                }}
              />
              <datalist id={`google-fonts-${role}`}>
                {GOOGLE_FONT_SHORTLIST.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {fontPreference[role] && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Clear ${FONT_ROLE_LABEL[role]} font`}
                  onClick={() => clearFont(role)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
