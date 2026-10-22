import Color from 'color'
import { describe, expect, it } from 'vitest'
import { computeAccents, computeBrand, darkenToContrast } from '../../src/services/theme'

const DEFAULTS: [string, string, string] = ['#3dd6c6', '#ffb454', '#b58cff']

describe('computeAccents', () => {
  it('light mode: chart-grade colors reach 3:1 on the white tile', () => {
    const a = computeAccents(DEFAULTS, false)
    for (const c of a.chart) expect(Color(c).contrast(Color('#ffffff'))).toBeGreaterThanOrEqual(3)
  })

  it('dark mode: colors are lightened, not darkened', () => {
    const a = computeAccents(DEFAULTS, true)
    a.c.forEach((c, i) => expect(Color(c).luminosity()).toBeGreaterThanOrEqual(Color(DEFAULTS[i]).luminosity()))
  })

  it('does not depend on the brand colour: the data colours are the only input', () => {
    expect(computeAccents(DEFAULTS, false).c).toEqual(computeAccents(DEFAULTS, false).c)
    expect(computeAccents(DEFAULTS, true).chart).toHaveLength(8)
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

describe('computeBrand', () => {
  it('light mode: the fill reaches 4.5:1 on white, so its text colour is white', () => {
    const b = computeBrand('#3a68b0', false)
    expect(Color(b.fill).contrast(Color('#ffffff'))).toBeGreaterThanOrEqual(4.5)
    expect(b.text).toBe(b.fill)
    expect(b.foreground).toBe('#ffffff')
  })

  it('dark mode: the colour is lightened and gets a dark text colour', () => {
    const b = computeBrand('#1b2a47', true)
    expect(Color(b.fill).luminosity()).toBeGreaterThan(Color('#1b2a47').luminosity())
    expect(b.foreground).toBe('#04161a')
  })
})
