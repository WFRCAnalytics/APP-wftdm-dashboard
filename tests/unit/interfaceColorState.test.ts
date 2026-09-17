import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearInterfaceColorOverride,
  getInterfaceColorOverride,
  setInterfaceColorOverride,
  subscribe,
} from '@/state/interfaceColorState'

describe('interfaceColorState', () => {
  afterEach(() => {
    clearInterfaceColorOverride('primary')
    clearInterfaceColorOverride('secondary')
    clearInterfaceColorOverride('accent')
  })

  it('starts with no override for any role', () => {
    expect(getInterfaceColorOverride('primary')).toBeUndefined()
    expect(getInterfaceColorOverride('secondary')).toBeUndefined()
    expect(getInterfaceColorOverride('accent')).toBeUndefined()
  })

  it('set/get round-trips per role, independently', () => {
    setInterfaceColorOverride('primary', '#111111')
    expect(getInterfaceColorOverride('primary')).toBe('#111111')
    expect(getInterfaceColorOverride('secondary')).toBeUndefined()
  })

  it('clear removes only that role’s override', () => {
    setInterfaceColorOverride('primary', '#111111')
    setInterfaceColorOverride('secondary', '#222222')
    clearInterfaceColorOverride('primary')
    expect(getInterfaceColorOverride('primary')).toBeUndefined()
    expect(getInterfaceColorOverride('secondary')).toBe('#222222')
  })

  it('notifies subscribers on set and on clear', () => {
    const fn = vi.fn()
    const unsubscribe = subscribe(fn)
    setInterfaceColorOverride('accent', '#333333')
    expect(fn).toHaveBeenCalledTimes(1)
    clearInterfaceColorOverride('accent')
    expect(fn).toHaveBeenCalledTimes(2)
    unsubscribe()
    setInterfaceColorOverride('accent', '#444444')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
