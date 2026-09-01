// T002/T003 (009-scenario-manager): appState.ts's new subscribe()/notify()
// mechanism. Extends appState.ts's existing register/setStatus/setActive/
// unregister behavior with a plain wildcard pub/sub, mirroring
// filterState.ts's own already-proven shape (research.md §1) — chosen over
// a key-based remount specifically to preserve panel-local state (FR-008).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  get,
  register,
  setActive,
  setStatus,
  subscribe,
  unregister,
} from '../../src/state/appState.ts'

afterEach(() => {
  // appState.ts has no reset() — clean up any name this file registered so
  // tests don't leak into each other via the module-level Map.
  for (const name of ['sub_test_1', 'sub_test_2', 'sub_test_3', 'sub_test_4']) {
    unregister(name)
  }
})

describe('appState.subscribe', () => {
  it('fires on register()', () => {
    const fn = vi.fn()
    subscribe(fn)
    register('sub_test_1', { source: 'handle' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fires on setStatus()', () => {
    register('sub_test_2', { source: 'handle' })
    const fn = vi.fn()
    subscribe(fn)
    setStatus('sub_test_2', 'ready')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fires on setActive()', () => {
    register('sub_test_3', { source: 'handle' })
    const fn = vi.fn()
    subscribe(fn)
    setActive('sub_test_3', true)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fires on unregister()', () => {
    register('sub_test_4', { source: 'handle' })
    const fn = vi.fn()
    subscribe(fn)
    unregister('sub_test_4')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(get('sub_test_4')).toBeUndefined()
  })

  it('an unsubscribed callback stops firing', () => {
    const fn = vi.fn()
    const unsubscribe = subscribe(fn)
    unsubscribe()
    register('sub_test_1', { source: 'handle' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('notifies every subscriber, not just the first', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    subscribe(fn1)
    subscribe(fn2)
    register('sub_test_1', { source: 'handle' })
    expect(fn1).toHaveBeenCalledTimes(1)
    expect(fn2).toHaveBeenCalledTimes(1)
  })
})
