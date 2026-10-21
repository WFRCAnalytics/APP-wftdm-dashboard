// Reads the chart theme from the mounted element (the tokens follow theme, text size and zoom) and builds the colour
// helpers from project-docs/redesign/01-visual-language.md section 5.4. Called once per draw.
import { cat, diverging, mixHex, modeColors, ramp, type ColorTokens } from '@/panels/chartColor'
import { readChartRadius, readColorTokens } from '@/panels/chartTheme'
import type { ChartTheme } from '@/charts/types'

/** Perceived lightness of a hex colour, 0..1. */
function lightness(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h
  const n = parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(n)) return 0.5
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Builds a theme from resolved tokens. Pure, so it is unit-testable without a DOM. */
export function buildChartTheme(
  tokens: ColorTokens,
  extra: { mute: string; line: string; grid: string; font: string; fs: number; r: number },
): ChartTheme {
  const modes = modeColors(tokens)
  return {
    ink: tokens.ink,
    mute: extra.mute,
    line: extra.line,
    grid: extra.grid,
    surface: tokens.surface,
    font: extra.font,
    fs: extra.fs,
    r: extra.r,
    dark: Boolean(tokens.dark),
    tokens,
    mode: (name) => modes[name] ?? mixHex(tokens.surface, tokens.ink, 0.45),
    cat: (i) => cat(i, tokens),
    ramp: (color, n, lo) => ramp(color, n, tokens, lo),
    neutral: (i) => mixHex(tokens.surface, tokens.ink, 0.2 + 0.08 * i),
    diverge: (t) => diverging(t, tokens),
    mix: mixHex,
    onColor: (fill) => (lightness(fill) > 0.55 ? '#0c1118' : '#ffffff'),
  }
}

export function readChartTheme(el: Element): ChartTheme {
  const style = getComputedStyle(el)
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  const fs = parseFloat(get('--chart-fs', '11.5')) * parseFloat(get('--zoom', '1'))
  return buildChartTheme(readColorTokens(el), {
    mute: get('--mute', '#586376'),
    line: get('--line', '#dbe1e9'),
    grid: get('--grid', '#e8ecf1'),
    font: style.fontFamily || get('--font-body', 'sans-serif'),
    fs: Number.isFinite(fs) ? fs : 11.5,
    r: readChartRadius(),
  })
}
