// Shared chart text theme (project-docs/redesign/05-tooltips-and-interaction.md, 01-visual-language.md §5).
// Every D3/Observable Plot panel takes its font, size and ink from here so charts match the interface typography.
// Values are CSS expressions over tokens.css custom properties, so they follow theme, text-size and zoom changes with
// no JavaScript re-read; --chart-fs and --zoom are unitless on purpose (see tokens.css).

/** Chart text size: 11.5px at zoom 1. */
export const CHART_FONT_SIZE = 'calc(var(--chart-fs) * 1px * var(--zoom))'

/** Style for the root of a Plot (axis ticks, labels). */
export function plotBaseStyle(): { fontSize: string; fontFamily: string; color: string } {
  return { fontSize: CHART_FONT_SIZE, fontFamily: 'var(--font-body)', color: 'var(--mute)' }
}

/** Style for a Plot legend swatch list. */
export function plotLegendStyle(): { fontFamily: string; fontSize: string; color: string } {
  return { fontFamily: 'var(--font-body)', fontSize: CHART_FONT_SIZE, color: 'var(--mute)' }
}

/** Radius in px of data dots (--chart-r), for D3 panels that need a number. Falls back to 5 outside a browser. */
export function readChartRadius(): number {
  if (typeof document === 'undefined') return 5
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chart-r'))
  return Number.isFinite(v) ? v : 5
}

/** The resolved colour tokens the semantic helpers in chartColor.ts need, read once per draw. */
export function readColorTokens(el: Element): import('@/panels/chartColor').ColorTokens {
  const style = getComputedStyle(el)
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    surface: get('--surface', '#ffffff'),
    ink: get('--ink', '#10151c'),
    c1: get('--c-1', '#2fa598'),
    c2: get('--c-2', '#c28940'),
    c3: get('--c-3', '#a781eb'),
    dark: document.documentElement.classList.contains('dark'),
  }
}
