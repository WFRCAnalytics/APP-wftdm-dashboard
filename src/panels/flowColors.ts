import { getColors, getColorsRGBA, getFlowColorScale, type Colors } from '@flowmap.gl/data'

// The flow map's own line colours, from flowmap.gl's own functions (the ones FlowmapLayer draws with), so the volume
// filter's ramp and bars are the colours of the lines.

/** The FlowmapLayer settings the colours depend on: its defaults (darkMode on, colorScheme 'Teal', fade on at 50, no
 * animation), which the panel keeps. */
const SCHEME = 'Teal'
const DARK_MODE = true
const FADE = { enabled: true, opacity: false, amount: 50 }

/** The colour of a flow line of `magnitude`, on flowmap.gl's scale over [0, max] (the magnitudes it is drawing). */
export function flowColorAt(max: number, darkMode = DARK_MODE): (magnitude: number) => string {
  const colors = getColorsRGBA(getColors(false, SCHEME, darkMode, FADE.enabled, FADE.opacity, FADE.amount, false) as Colors)
  const scale = getFlowColorScale(colors, [0, max], false)
  return (magnitude) => {
    const [r, g, b, a] = scale(magnitude)
    return `rgba(${r}, ${g}, ${b}, ${+((a ?? 255) / 255).toFixed(3)})`
  }
}
