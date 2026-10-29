import { describe, expect, it } from 'vitest'

import { cleanMaxActive, cleanWarnAt, resolveLimits } from '../../src/config/scenarioLimits'

describe('scenario limits', () => {
  it('defaults to a warning at 8 and a maximum of 16', () => {
    expect(resolveLimits(undefined, undefined)).toEqual({ warnAt: 8, maxActive: 16 })
  })
  it('accepts a maximum above 16 but warns clearly', () => {
    const r = cleanMaxActive(24)
    expect(r.value).toBe(24)
    expect(r.messages).toHaveLength(1)
    expect(r.messages[0]).toMatch(/WebGL/)
    expect(cleanMaxActive(16).messages).toEqual([])
  })
  it('rejects values that are not whole numbers of 1 or more', () => {
    for (const bad of [0, -3, 2.5, '8', null]) {
      expect(cleanMaxActive(bad).value).toBeUndefined()
      expect(cleanWarnAt(bad).value).toBeUndefined()
    }
  })
  it('pulls a warning point above the maximum down to it', () => {
    expect(resolveLimits(30, 12)).toEqual({ warnAt: 12, maxActive: 12 })
  })
})
