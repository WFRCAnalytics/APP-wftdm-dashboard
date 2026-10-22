import { useEffect, useState } from 'react'
import type { IUIThemeConfig, IGWProps } from '@kanaries/graphic-walker'

import { resolveCategoryFallbackColors } from '@/panels/chartColor'

// Graphic Walker renders inside a shadow root, so this app's own
// stylesheet can't reach its internals. Its two supported theming props
// are `uiTheme` (chrome: buttons, field lists, borders) and
// `vizThemeConfig` (the Vega chart itself). This module resolves both
// from the app's REAL, currently-computed design tokens (tokens.css plus
// any viewer/deployer interface-color override on <html>), so the Explore
// tab follows the same palette, font and light/dark mode as everything
// else instead of GW's built-in blue/Inter look.

const CHART_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const
const CHART_FALLBACK = ['#3358be', '#ba7f00', '#cc4330', '#008029', '#914edc']

function token(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback
}

function parseHex(color: string): [number, number, number, number] | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(color)
  if (!m) return null
  let h = m[1]
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
  if (h.length !== 6 && h.length !== 8) return null
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]
}

/** tokens.css's dark --border/--input are alpha-hex (white at 10-15%);
 * GW feeds colors into its own Tailwind utilities and Vega, which don't
 * all tolerate alpha, so flatten against the surface they sit on. */
function flatten(color: string, over: string): string {
  const fg = parseHex(color)
  const bg = parseHex(over)
  if (!fg || !bg || fg[3] === 1) return color
  const mix = (i: 0 | 1 | 2) => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3]))
  return `#${[mix(0), mix(1), mix(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

type GWGlobalConfig = Exclude<IGWProps['vizThemeConfig'], string | undefined>

/** Linear sRGB mix of two hex colors, `t` of the way from `a` to `b`. */
function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return b
  const ch = (i: 0 | 1 | 2) => Math.round(x[i] + (y[i] - x[i]) * t)
  return `#${[ch(0), ch(1), ch(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export interface GraphicWalkerTheme {
  uiTheme: IUIThemeConfig
  vizThemeConfig: GWGlobalConfig
}

/** Reads the tokens as they resolve RIGHT NOW (i.e. for the active
 * light/dark mode), and returns that one palette under both the `light`
 * and `dark` keys — GW only ever picks the key matching its `appearance`
 * prop, so callers re-invoke this whenever the mode or an interface-color
 * override changes. */
export function buildGraphicWalkerTheme(root: HTMLElement = document.documentElement): GraphicWalkerTheme {
  const s = getComputedStyle(root)
  const background = token(s, '--background', '#ffffff')
  const card = token(s, '--card', background)
  const foreground = token(s, '--foreground', '#000000')
  const muted = token(s, '--muted', '#f5f5f5')
  const mutedForeground = token(s, '--muted-foreground', '#737373')
  const border = flatten(token(s, '--border', '#e5e5e5'), card)
  const input = flatten(token(s, '--input', '#e5e5e5'), card)
  const font = token(s, '--font-body', 'sans-serif')
  const palette = resolveCategoryFallbackColors(root, CHART_TOKENS, CHART_FALLBACK)

  const colors = {
    background: card,
    foreground,
    card,
    'card-foreground': token(s, '--card-foreground', foreground),
    popover: token(s, '--popover', card),
    'popover-foreground': token(s, '--popover-foreground', foreground),
    primary: token(s, '--primary', foreground),
    'primary-foreground': token(s, '--primary-foreground', background),
    secondary: token(s, '--secondary', muted),
    'secondary-foreground': token(s, '--secondary-foreground', foreground),
    muted,
    'muted-foreground': mutedForeground,
    accent: token(s, '--accent', muted),
    'accent-foreground': token(s, '--accent-foreground', foreground),
    destructive: token(s, '--destructive', '#e7000b'),
    'destructive-foreground': token(s, '--destructive-foreground', '#fafafa'),
    // GW's field-pill hues: reuse the first two categorical chart colors
    // so dimensions/measures read as part of the same palette as the charts.
    dimension: palette[0],
    measure: palette[4] ?? palette[1],
    border,
    input,
    ring: token(s, '--ring', '#a1a1a1'),
  }

  // Sequential ramp for quantitative color: from a light tint of the first
  // categorical chart color (against the card surface) up to the full
  // color, instead of GW's default rainbow. Same hue as the categorical
  // palette's lead color, so one-hue ramps read as part of the same system.
  const ramp = [0.12, 0.35, 0.6, 0.8, 1].map((t) => mix(card, palette[0], t))

  const vega = {
    background: 'transparent',
    font,
    view: { stroke: 'transparent' },
    range: { category: palette, ramp, heatmap: ramp },
    scale: { continuous: { range: ramp } },
    axis: {
      labelColor: mutedForeground,
      titleColor: foreground,
      domainColor: border,
      tickColor: border,
      gridColor: border,
      labelFont: font,
      titleFont: font,
      titleFontWeight: 500,
    },
    legend: {
      labelColor: mutedForeground,
      titleColor: foreground,
      labelFont: font,
      titleFont: font,
      titleFontWeight: 500,
    },
    header: { labelColor: mutedForeground, titleColor: foreground, labelFont: font, titleFont: font },
    title: { color: foreground, font },
    text: { color: foreground, font },
  }

  return {
    uiTheme: { light: colors, dark: colors },
    // Cast: GW's own GWGlobalConfig is a vega-lite Config intersection;
    // this object is a strict subset of its fields.
    vizThemeConfig: { light: vega, dark: vega } as unknown as GWGlobalConfig,
  }
}

/**
 * The theme as the app's tokens currently resolve, kept live. The app
 * derives some tokens (`--chart-N`, interface-color overrides) in JS a
 * moment AFTER it flips the `.dark` class or sets an inline custom
 * property on <html>, so a theme read at the instant of the class change
 * can be stale. This watches the root's `class` and `style` attributes
 * and rebuilds on the next frame, only publishing a new object when the
 * resolved values actually differ (GraphicWalker re-renders its charts
 * on a new theme object).
 */
export function useGraphicWalkerTheme(): GraphicWalkerTheme {
  const [theme, setTheme] = useState(() => buildGraphicWalkerTheme())

  useEffect(() => {
    let frame = 0
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = buildGraphicWalkerTheme()
        setTheme((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
      })
    }
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    refresh()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  return theme
}
