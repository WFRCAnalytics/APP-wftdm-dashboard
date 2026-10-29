import { describe, expect, it } from 'vitest'

import { clampLimit, EXPLORE_LIMITS, limitClean, limitDef, SETTINGS } from '../../src/config'
import { DEFAULT_LIMITS } from '../../src/explore/options'

describe('the Explore limits table', () => {
  it('has every default inside its range', () => {
    for (const l of EXPLORE_LIMITS) if (l.default !== null) expect(l.default, l.key).toBeGreaterThanOrEqual(l.min), expect(l.default, l.key).toBeLessThanOrEqual(l.max)
  })

  it('matches the defaults the panel options start from', () => {
    const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    for (const l of EXPLORE_LIMITS) expect((DEFAULT_LIMITS as unknown as Record<string, unknown>)[camel(l.key)], l.key).toBe(l.default)
  })

  it('keeps the ranges the four first limits always had', () => {
    expect([limitDef('csv_rows')!.min, limitDef('csv_rows')!.max]).toEqual([1, 5_000_000])
    expect([limitDef('page_size')!.min, limitDef('page_size')!.max]).toEqual([5, 200])
    expect([limitDef('undo_steps')!.min, limitDef('undo_steps')!.max]).toEqual([1, 500])
    expect([limitDef('max_joins')!.min, limitDef('max_joins')!.max]).toEqual([1, 8])
  })

  it('has one integer schema row per limit that cascades', () => {
    for (const l of EXPLORE_LIMITS) {
      const row = SETTINGS.find((r) => r.path === `explore.limits.${l.key}`)
      expect(row, l.key).toMatchObject({ type: 'integer', cascade: true })
      expect(row!.description).toContain('to')
    }
  })
})

describe('clampLimit', () => {
  it('keeps a number inside the range', () => expect(clampLimit('chart_rows', 1000)).toEqual({ value: 1000 }))
  it('pulls a number to the nearest end with a message', () => {
    expect(clampLimit('histogram_bins', 500)).toEqual({ value: 100, message: '500 is outside 2 to 100, so 100 is used' })
    expect(clampLimit('histogram_bins', 1)).toMatchObject({ value: 2 })
  })
  it('rounds a fraction', () => expect(clampLimit('legend_series', 7.4).value).toBe(7))
  it('gives the default for something that is not a number', () => {
    for (const v of ['lots', NaN, Infinity, null]) expect(clampLimit('scatter_sample', v).message, String(v)).toBeTruthy()
    expect(clampLimit('scatter_sample', 'lots').value).toBe(5000)
  })
  it('limitClean reports the clamp', () => expect(limitClean('pivot_rows')(10000)).toEqual({ value: 5000, messages: ['10000 is outside 20 to 5000, so 5000 is used'] }))
})
