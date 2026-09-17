import { afterEach, describe, expect, it, vi } from 'vitest'

import { getColorblindSafe, setColorblindSafe, subscribe } from '@/state/colorPreferenceState'

// 061-appearance-controls — mirrors themeState.ts's own module-level
// subscribe/notify shape; no dedicated themeState.test.ts exists to mirror
// directly, so this follows scenarioDisplay.test.ts's afterEach-reset
// convention for module-level state instead.

describe('colorPreferenceState', () => {
  afterEach(() => {
    setColorblindSafe(false)
  })

  it('starts false', () => {
    expect(getColorblindSafe()).toBe(false)
  })

  it('set/get round-trips', () => {
    setColorblindSafe(true)
    expect(getColorblindSafe()).toBe(true)
  })

  it('notifies subscribers on change', () => {
    const fn = vi.fn()
    const unsubscribe = subscribe(fn)
    setColorblindSafe(true)
    expect(fn).toHaveBeenCalledTimes(1)
    unsubscribe()
    setColorblindSafe(false)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
