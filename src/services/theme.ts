// Accent engine for the Corridor Pro redesign (project-docs/redesign/01-visual-language.md §2.3, §5.4).
//
// The user (or deployer) picks three colors. Raw colors rarely work on both a white tile and a near-black tile, so this
// module adapts them per theme and writes the derived custom properties inline on <html>:
//   --c-1..3        chart-grade series colors (light: darkened until 3:1 on the white tile; dark: lightened 28%)
//   --chart-1..8    categorical palette: the three colors, their blends, and two tints (spec §5.4)
// The interface colour is a separate fourth choice, so changing a data colour never recolours the chrome:
//   --brand         the interface colour as a fill (selected pills, toggles, tags)
//   --brand-text    text-grade interface colour (light: 4.5:1 on white; dark: same as --brand)
//   --primary, --primary-foreground, --ring (+ the sidebar equivalents) follow the brand colour
// With no color configured nothing is written, so tokens.css's static defaults apply.
import Color from 'color'

import { getInterfaceColorOverride, subscribe as subscribeToOverrides } from '@/state/interfaceColorState'
import { getMode as getThemeMode, subscribe as subscribeToTheme } from '@/state/themeState'
import { resolveInterfaceColor, type InterfaceColorRole } from '@/panels/interfaceColor'

const ROLES: InterfaceColorRole[] = ['primary', 'secondary', 'accent']
const LIGHT_TILE = '#ffffff'
const DARK_TILE = '#141922'
const DARK_LIGHTEN = 0.28
const CHART_CONTRAST = 3
const TEXT_CONTRAST = 4.5

/** Custom properties this module owns; all are removed when no color is configured. */
const DATA_OWNED = [
  '--c-1', '--c-2', '--c-3',
  '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--chart-7', '--chart-8',
]
const BRAND_OWNED = [
  '--brand', '--brand-text',
  '--primary', '--primary-foreground', '--ring',
  '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-ring',
]

export interface AccentSet {
  c: [string, string, string]
  chart: string[]
}

export interface BrandSet {
  /** The fill behind selected pills and toggles. */
  fill: string
  /** Text-grade brand colour (titles, tag text, focus rings). */
  text: string
  /** Legible text colour on `fill`. */
  foreground: string
}

function mix(a: string, b: string, t: number): string {
  return Color(a).mix(Color(b), t).hex().toLowerCase()
}

/** Darkens `hex` toward black until it reaches `target`:1 against `bg` (or returns it unchanged when it already does). */
export function darkenToContrast(hex: string, bg: string, target: number): string {
  const bgColor = Color(bg)
  let t = 0
  let out = Color(hex)
  while (out.contrast(bgColor) < target && t < 1) {
    t = Math.min(1, t + 0.01)
    out = Color(hex).mix(Color('#000000'), t)
  }
  return out.hex().toLowerCase()
}

/** Lightens `hex` toward white until it reaches `target`:1 against `bg` (or returns it unchanged when it already does). */
export function lightenToContrast(hex: string, bg: string, target: number): string {
  const bgColor = Color(bg)
  let t = 0
  let out = Color(hex)
  while (out.contrast(bgColor) < target && t < 1) {
    t = Math.min(1, t + 0.01)
    out = Color(hex).mix(Color('#ffffff'), t)
  }
  return out.hex().toLowerCase()
}

/** Adapts the three user colors for one theme and derives the full accent set. Pure; unit-tested. */
export function computeAccents(colors: [string, string, string], dark: boolean): AccentSet {
  const c = colors.map((u) =>
    dark ? mix(u, '#ffffff', DARK_LIGHTEN) : darkenToContrast(u, LIGHT_TILE, CHART_CONTRAST),
  ) as [string, string, string]
  const tint = '#ffffff'
  // spec §5.4: three colors, three pairwise blends, then tints of the first two. Light-mode blends are darkened to stay 3:1.
  const blends = [mix(c[0], c[1], 0.5), mix(c[1], c[2], 0.5), mix(c[2], c[0], 0.5)]
  const tints = [mix(c[0], tint, dark ? 0.35 : 0.2), mix(c[1], tint, dark ? 0.35 : 0.2)]
  const rest = [...blends, ...tints].map((x) => (dark ? x : darkenToContrast(x, LIGHT_TILE, CHART_CONTRAST)))
  return { c, chart: [...c, ...rest] }
}

/** Adapts the brand colour for one theme: light darkens it to 4.5:1 on white (so white text works on the fill), dark lightens it. Pure. */
export function computeBrand(color: string, dark: boolean): BrandSet {
  const text = dark ? lightenToContrast(mix(color, '#ffffff', DARK_LIGHTEN), DARK_TILE, TEXT_CONTRAST) : darkenToContrast(color, LIGHT_TILE, TEXT_CONTRAST)
  return { fill: text, text, foreground: Color(text).isLight() ? '#04161a' : '#ffffff' }
}

function effectiveBrand(): string | null {
  const resolved = resolveInterfaceColor('brand', getInterfaceColorOverride('brand'))
  return resolved && CSS.supports('color', resolved) ? Color(resolved).hex() : null
}

function effectiveColors(): [string, string, string] | null {
  const resolved = ROLES.map((role) => resolveInterfaceColor(role, getInterfaceColorOverride(role)))
  if (resolved.every((v) => !v)) return null
  // A role the user did not set falls back to the static default: read it from the stylesheet's own light palette.
  const fallback = ['#2fa598', '#c28940', '#a781eb']
  return resolved.map((v, i) => (v && CSS.supports('color', v) ? Color(v).hex() : fallback[i])) as [string, string, string]
}

/** Writes (or clears) the accent custom properties on <html> for the current theme and colors. */
export function applyAccents(root: HTMLElement = document.documentElement): void {
  const dark = root.classList.contains('dark')
  const set = (name: string, value: string) => root.style.setProperty(name, value)

  const colors = effectiveColors()
  if (colors) {
    const a = computeAccents(colors, dark)
    a.c.forEach((v, i) => set(`--c-${i + 1}`, v))
    a.chart.forEach((v, i) => set(`--chart-${i + 1}`, v))
  } else {
    for (const name of DATA_OWNED) root.style.removeProperty(name)
  }

  const brandColor = effectiveBrand()
  if (brandColor) {
    const b = computeBrand(brandColor, dark)
    set('--brand', b.fill)
    set('--brand-text', b.text)
    for (const name of ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring']) set(name, b.fill)
    set('--primary-foreground', b.foreground)
    set('--sidebar-primary-foreground', b.foreground)
  } else {
    for (const name of BRAND_OWNED) root.style.removeProperty(name)
  }
}

let started = false

/** Applies the accents now and keeps them current: re-runs on any color change and whenever <html>'s `dark` class flips. Idempotent. */
export function startAccentSync(): void {
  applyAccents()
  if (started) return
  started = true
  subscribeToOverrides(() => applyAccents())
  let wasDark = document.documentElement.classList.contains('dark')
  new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains('dark')
    if (isDark !== wasDark) {
      wasDark = isDark
      applyAccents()
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

let themeStarted = false

/** Applies the theme mode (state/themeState.ts) to <html>'s `dark` class and keeps it current. In 'system' mode it follows
 * the OS preference live. Owned here, not by the Settings modal, so the nav's light/dark toggle works with Settings closed. */
export function startThemeSync(): void {
  if (themeStarted) return
  themeStarted = true
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const mode = getThemeMode()
    document.documentElement.classList.toggle('dark', mode === 'system' ? mq.matches : mode === 'dark')
  }
  apply()
  subscribeToTheme(apply)
  mq.addEventListener('change', apply)
}
