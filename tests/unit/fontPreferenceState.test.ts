import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearFont, getFont, setFont, subscribe } from '@/state/fontPreferenceState'

describe('fontPreferenceState', () => {
  afterEach(() => {
    clearFont('body')
    clearFont('heading')
    clearFont('mono')
  })

  it('starts with no selection for any role', () => {
    expect(getFont('body')).toBeUndefined()
    expect(getFont('heading')).toBeUndefined()
    expect(getFont('mono')).toBeUndefined()
  })

  it('set/get round-trips per role, independently', () => {
    setFont('body', 'Merriweather')
    expect(getFont('body')).toBe('Merriweather')
    expect(getFont('heading')).toBeUndefined()
  })

  it('clear removes only that role’s selection', () => {
    setFont('body', 'Merriweather')
    setFont('mono', 'Fira Code')
    clearFont('body')
    expect(getFont('body')).toBeUndefined()
    expect(getFont('mono')).toBe('Fira Code')
  })

  it('notifies subscribers on set and on clear', () => {
    const fn = vi.fn()
    const unsubscribe = subscribe(fn)
    setFont('heading', 'Merriweather')
    expect(fn).toHaveBeenCalledTimes(1)
    clearFont('heading')
    expect(fn).toHaveBeenCalledTimes(2)
    unsubscribe()
    setFont('heading', 'Lato')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
