import { useEffect } from 'react'
import { X } from 'lucide-react'

import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useThemeMode } from '@/hooks/useThemeMode'
import { setMode, type ThemeMode } from '@/state/themeState'
import { useColorblindSafePreference } from '@/hooks/useColorblindSafePreference'
import { setColorblindSafe } from '@/state/colorPreferenceState'
import { useTextSize } from '@/hooks/useTextSize'
import { DEFAULT_SCALE, MAX_SCALE, MIN_SCALE, setScale } from '@/state/textSizeState'
import { InterfaceColorControl } from '@/layout/settings/interfaceColorControl'
import { GroupHeading, PillButton, SettingsRow, TabHeader } from '@/layout/settings/settingsParts'
import { useFontPreference } from '@/hooks/useFontPreference'
import { clearFont, setFont, type FontRole } from '@/state/fontPreferenceState'
import { clearInterfaceColorOverride, setInterfaceColorOverride } from '@/state/interfaceColorState'
import { clearGoogleFont, ensureGoogleFontLoaded } from '@/panels/googleFontLoader'
import type { InterfaceColorRole } from '@/panels/interfaceColor'

// The Appearance tab (project-docs/redesign/02-layout-and-components.md section 4.1): theme, colour-blind-safe palette,
// interface colours, type, text size and a reset. Everything is session-only state (no storage of any kind).

export type { ThemeMode } from '@/state/themeState'

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
]

const ROLES: { role: InterfaceColorRole; label: string }[] = [
  { role: 'primary', label: 'Primary' },
  { role: 'secondary', label: 'Secondary' },
  { role: 'accent', label: 'Tertiary' },
]

// Four presets, each a primary / secondary / tertiary triple (the prototype's own set).
const PRESETS: { name: string; colors: [string, string, string] }[] = [
  { name: 'WFRC blue', colors: ['#2457D6', '#D98A00', '#7A4FD8'] },
  { name: 'Wasatch', colors: ['#0E7C7B', '#E4572E', '#5C6BC0'] },
  { name: 'Slate', colors: ['#334E68', '#E0A100', '#2F9E8F'] },
  { name: 'Plum', colors: ['#6D3FC8', '#0C8F6F', '#D9534F'] },
]

// The four type cards. Schibsted Grotesk is the self-hosted default (selecting it clears the preference); Geist and IBM
// Plex Sans load from Google Fonts like any custom font; System UI is the platform's own font, loaded from nowhere.
const DEFAULT_FONT = 'Schibsted Grotesk'
const SYSTEM_FONT = 'System UI'
const SYSTEM_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const FONT_CARDS: { name: string; family: string }[] = [
  { name: DEFAULT_FONT, family: '"Schibsted Grotesk Variable", sans-serif' },
  { name: 'Geist', family: '"Geist", system-ui, sans-serif' },
  { name: 'IBM Plex Sans', family: '"IBM Plex Sans", system-ui, sans-serif' },
  { name: SYSTEM_FONT, family: SYSTEM_STACK },
]
const PREVIEW_FONTS = ['Geist', 'IBM Plex Sans']

// A small, bundled shortlist for the custom-font inputs; free text is accepted too (any Google Font).
const GOOGLE_FONT_SHORTLIST = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Source Sans Pro', 'Merriweather', 'Playfair Display', 'Nunito',
  'Raleway', 'Ubuntu', 'Rubik', 'Work Sans', 'Inter', 'Mulish', 'Quicksand', 'Karla', 'DM Sans', 'Fira Sans', 'PT Sans',
  'Noto Sans', 'Josefin Sans', 'Oswald', 'Libre Baskerville', 'Crimson Text', 'IBM Plex Sans', 'Fira Code', 'JetBrains Mono',
  'Space Mono', 'Source Code Pro',
]

const FONT_ROLE_LABEL: Record<FontRole, string> = {
  body: 'Body',
  heading: 'Heading',
  mono: 'Monospace',
}

function applyFont(role: FontRole, name: string | undefined) {
  if (name === SYSTEM_FONT) {
    clearGoogleFont(role)
    document.documentElement.style.setProperty(`--font-${role}`, SYSTEM_STACK)
  } else if (name) {
    ensureGoogleFontLoaded(role, name)
  } else {
    clearGoogleFont(role)
  }
}

export function AppearanceTab() {
  const mode = useThemeMode()
  const colorblindSafe = useColorblindSafePreference()
  const textSize = useTextSize()
  const fontPreference = useFontPreference()

  // Applies the text-size scale: every rem-based element resizes through the ordinary cascade.
  useEffect(() => {
    document.documentElement.style.fontSize = `${textSize}%`
  }, [textSize])

  // The accent colours are applied by services/theme.ts (startAccentSync), and the `dark` class by startThemeSync
  // (which follows prefers-color-scheme live while the mode is System); nothing to do here for either.

  // Turns a font-preference change into the real <link>/--font-* DOM side effect.
  useEffect(() => {
    for (const role of ['body', 'heading', 'mono'] as const) applyFont(role, fontPreference[role])
  }, [fontPreference])

  // Loads the two Google-hosted card fonts so their "Aa" previews render in them. Offline it just falls back.
  useEffect(() => {
    const links = PREVIEW_FONTS.map((name) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@600&display=swap`
      document.head.appendChild(link)
      return link
    })
    return () => links.forEach((l) => l.remove())
  }, [])

  const selectedFont = fontPreference.body ?? DEFAULT_FONT

  function chooseFont(name: string) {
    if (name === DEFAULT_FONT) {
      clearFont('body')
      clearFont('heading')
    } else {
      setFont('body', name)
      setFont('heading', name)
    }
  }

  function resetAppearance() {
    setColorblindSafe(false)
    for (const { role } of ROLES) clearInterfaceColorOverride(role)
    for (const role of ['body', 'heading', 'mono'] as const) clearFont(role)
    setScale(DEFAULT_SCALE)
  }

  return (
    <div>
      <TabHeader title="Appearance">
        These choices apply only to you, for this session. A deployment can set its own defaults for the title, logo,
        colours and palette.
      </TabHeader>

      <SettingsRow title="Theme" help="Follow your system, or pick one.">
        <Segmented
          label="Theme"
          size="lg"
          options={THEME_OPTIONS}
          value={mode}
          onChange={(id) => setMode(id as ThemeMode)}
        />
      </SettingsRow>

      <SettingsRow
        title={<span>Colour-blind-safe scenario palette</span>}
        help="Swaps the scenario colours for a set that stays distinct for common colour-vision differences."
      >
        {/* The title is a plain span (not a label for the switch), so clicking the text never toggles it. */}
        <Switch
          size="lg"
          aria-label="Colour-blind-safe scenario palette"
          checked={colorblindSafe}
          onCheckedChange={setColorblindSafe}
        />
      </SettingsRow>

      <GroupHeading>Interface colours</GroupHeading>
      <SettingsRow
        align="start"
        title="Primary, secondary, tertiary"
        help="Drive highlights, selected states and the colours for transit, walking and biking."
      >
        <div>
          {ROLES.map(({ role, label }) => (
            <InterfaceColorControl key={role} role={role} label={label} />
          ))}
          <div className="mt-2 flex max-w-[340px] items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                title={p.name}
                aria-label={`Use the ${p.name} colours`}
                onClick={() => ROLES.forEach(({ role }, i) => setInterfaceColorOverride(role, p.colors[i]))}
                className="flex overflow-hidden rounded-[9px] border border-[var(--glass-line)] p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
              >
                {p.colors.map((c) => (
                  <i key={c} className="h-[22px] w-3" style={{ background: c }} />
                ))}
              </button>
            ))}
            <button
              type="button"
              onClick={() => ROLES.forEach(({ role }) => clearInterfaceColorOverride(role))}
              className="ml-auto rounded text-[var(--brand-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
            >
              Reset
            </button>
          </div>
        </div>
      </SettingsRow>

      <GroupHeading>Type</GroupHeading>
      <div role="radiogroup" aria-label="Font" className="grid grid-cols-4 gap-2.5 max-[900px]:grid-cols-2">
        {FONT_CARDS.map((f) => {
          const checked = selectedFont === f.name
          return (
            <button
              key={f.name}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => chooseFont(f.name)}
              className={cn(
                'rounded-[14px] border p-3 text-left transition-colors motion-reduce:transition-none',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
                checked
                  ? 'border-[var(--brand-text)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                  : 'border-[var(--line)] hover:border-[var(--mute)]',
              )}
            >
              <b className="block text-[22px] font-semibold" style={{ fontFamily: f.family }}>
                Aa
              </b>
              <small className="text-[var(--mute)]">{f.name}</small>
            </button>
          )
        })}
      </div>
      {/* Any Google Font by name, per role: kept from the earlier design for deployments that want a specific face. */}
      <details className="mt-3 text-[var(--mute)]">
        <summary className="w-fit cursor-pointer rounded text-[12.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]">
          Custom fonts
        </summary>
        <div className="mt-3 grid grid-cols-3 gap-4 max-[900px]:grid-cols-1">
          {(['body', 'heading', 'mono'] as const).map((role) => (
            <div key={role} className="flex flex-col gap-1.5">
              <label htmlFor={`font-picker-${role}`} className="text-xs">
                {FONT_ROLE_LABEL[role]}
              </label>
              <div className="flex items-center gap-1">
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
                    className="shrink-0"
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
      </details>

      <div className="mt-3">
        <SettingsRow title="Text size" help={`${textSize}%`}>
          <Slider
            aria-label="Text size"
            className="w-[220px]"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={5}
            value={[textSize]}
            onValueChange={([next]) => setScale(next)}
          />
        </SettingsRow>
        <SettingsRow title="Reset appearance" help="Return to the deployment defaults.">
          <PillButton onClick={resetAppearance}>Reset</PillButton>
        </SettingsRow>
      </div>
    </div>
  )
}
