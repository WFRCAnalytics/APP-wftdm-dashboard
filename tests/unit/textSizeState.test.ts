import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCALE, MAX_SCALE, MIN_SCALE, getScale, setScale, subscribe } from '@/state/textSizeState'

describe('textSizeState', () => {
  afterEach(() => {
    setScale(DEFAULT_SCALE)
  })

  it('starts at the default (100)', () => {
    expect(getScale()).toBe(100)
    expect(DEFAULT_SCALE).toBe(100)
  })

  it('set/get round-trips within range', () => {
    setScale(125)
    expect(getScale()).toBe(125)
  })

  it('clamps below the minimum', () => {
    setScale(10)
    expect(getScale()).toBe(MIN_SCALE)
  })

  it('clamps above the maximum', () => {
    setScale(999)
    expect(getScale()).toBe(MAX_SCALE)
  })

  it('notifies subscribers on change', () => {
    const fn = vi.fn()
    const unsubscribe = subscribe(fn)
    setScale(110)
    expect(fn).toHaveBeenCalledTimes(1)
    unsubscribe()
    setScale(120)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
