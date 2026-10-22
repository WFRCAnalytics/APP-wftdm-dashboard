import Color from 'color'
import { describe, expect, it } from 'vitest'
import { computeAccents, darkenToContrast } from '../../src/services/theme'

const DEFAULTS: [string, string, string] = ['#3dd6c6', '#ffb454', '#b58cff']

describe('computeAccents', () => {
  it('light mode: chart-grade colors reach 3:1 and brand text 4.5:1 on the white tile', () => {
    const a = computeAccents(DEFAULTS, false)
    for (const c of a.chart) expect(Color(c).contrast(Color('#ffffff'))).toBeGreaterThanOrEqual(3)
    expect(Color(a.brandText).contrast(Color('#ffffff'))).toBeGreaterThanOrEqual(4.5)
  })

  it('dark mode: colors are lightened, not darkened', () => {
    const a = computeAccents(DEFAULTS, true)
    a.c.forEach((c, i) => expect(Color(c).luminosity()).toBeGreaterThanOrEqual(Color(DEFAULTS[i]).luminosity()))
    expect(a.brandText).toBe(a.c[0])
  })

  it('returns 8 categorical colors, the first three being the adapted user colors', () => {
    const a = computeAccents(DEFAULTS, false)
    expect(a.chart).toHaveLength(8)
    expect(a.chart.slice(0, 3)).toEqual(a.c)
  })

  it('darkenToContrast leaves an already-sufficient color unchanged', () => {
    expect(darkenToContrast('#000000', '#ffffff', 4.5)).toBe('#000000')
  })
})
