import { describe, expect, it } from 'vitest'

import { niceRingMax } from '@/panels/ringMax'

describe('niceRingMax', () => {
  it('picks a round number with headroom above the larger value', () => {
    expect(niceRingMax([1.1, 1.0], true)).toBe(1.5)
    expect(niceRingMax([26.9, 26.6], true)).toBe(40)
    expect(niceRingMax([69.5, 69.9], true)).toBe(100)
    expect(niceRingMax([23583, 23583])).toBe(30000)
  })

  it('never goes past 100 for a percent, and copes with zero or missing values', () => {
    expect(niceRingMax([95], true)).toBe(100)
    expect(niceRingMax([95])).toBe(150)
    expect(niceRingMax([0, 0], true)).toBe(100)
    expect(niceRingMax([Number.NaN])).toBe(1)
  })
})
