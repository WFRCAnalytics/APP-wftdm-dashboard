// T002/T003 (009-scenario-manager): appState.ts's new subscribe()/notify()
// mechanism. Extends appState.ts's existing register/setStatus/setActive/
// unregister behavior with a plain wildcard pub/sub, mirroring
// filterState.ts's own already-proven shape (research.md §1) — chosen over
// a key-based remount specifically to preserve panel-local state (FR-008).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  get,
  getBaseline,
  register,
  setActive,
  setBaseline,
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

// 018-baseline-scenario-designation: getBaseline()/setBaseline() and
// unregister()'s new fallback-clearing behavior. Self-contained afterEach
// (scoped to this describe, not the sub_test_* cleanup above) — every test
// here uses its own disjoint name set and cleans all of them up, so each
// test starts from a genuinely empty Map (quickstart.md Scenarios 1-3).
describe('appState.getBaseline / setBaseline', () => {
  afterEach(() => {
    for (const name of ['observed', 'abm_2026', 'base_tbm', 'extra', 'not_ready']) {
      unregister(name)
    }
  })

  it('is undefined when nothing is loaded', () => {
    expect(getBaseline()).toBeUndefined()
  })

  it('setBaseline throws on an unregistered name', () => {
    expect(() => setBaseline('abm_2026')).toThrow(/never registered/)
  })

  it('mutual exclusivity: marking a new baseline moves the designation, never both/neither', () => {
    register('abm_2026', { source: 'url' })
    register('base_tbm', { source: 'url' })

    setBaseline('abm_2026')
    expect(getBaseline()).toBe('abm_2026')

    setBaseline('base_tbm')
    expect(getBaseline()).toBe('base_tbm')

    // Re-marking the current baseline is idempotent (FR-001 Acceptance
    // Scenario 3) — no change, no error.
    setBaseline('base_tbm')
    expect(getBaseline()).toBe('base_tbm')
  })

  it('automatic default excludes pinned entries — observed never wins by default', () => {
    register('observed', { source: 'url', pinned: true })
    setStatus('observed', 'ready')
    expect(getBaseline()).toBeUndefined()

    register('abm_2026', { source: 'url' })
    setStatus('abm_2026', 'ready')
    expect(getBaseline()).toBe('abm_2026')
  })

  it('automatic default does not move once resolved, even as more scenarios load', () => {
    register('abm_2026', { source: 'url' })
    setStatus('abm_2026', 'ready')
    expect(getBaseline()).toBe('abm_2026')

    register('base_tbm', { source: 'url' })
    setStatus('base_tbm', 'ready')
    expect(getBaseline()).toBe('abm_2026')
  })

  it('automatic default skips a scenario that is not yet ready', () => {
    register('not_ready', { source: 'url' }) // status stays 'registering'
    expect(getBaseline()).toBeUndefined()

    register('abm_2026', { source: 'url' })
    setStatus('abm_2026', 'ready')
    expect(getBaseline()).toBe('abm_2026')
  })

  it('an explicit baseline can target a pinned scenario if chosen deliberately', () => {
    register('observed', { source: 'url', pinned: true })
    setStatus('observed', 'ready')
    setBaseline('observed')
    expect(getBaseline()).toBe('observed')
  })

  it('removing the explicit baseline falls back to the same automatic-default rule', () => {
    register('abm_2026', { source: 'handle' })
    setStatus('abm_2026', 'ready')
    register('base_tbm', { source: 'url' })
    setStatus('base_tbm', 'ready')

    setBaseline('base_tbm')
    expect(getBaseline()).toBe('base_tbm')

    unregister('base_tbm')
    expect(getBaseline()).toBe('abm_2026')
  })

  it('removing the ONLY remaining scenario after it held the baseline resolves to undefined', () => {
    register('abm_2026', { source: 'handle' })
    setStatus('abm_2026', 'ready')
    setBaseline('abm_2026')
    expect(getBaseline()).toBe('abm_2026')

    unregister('abm_2026')
    expect(getBaseline()).toBeUndefined()
  })

  it('removing a scenario that is NOT the current baseline leaves it completely unaffected', () => {
    register('abm_2026', { source: 'url' })
    setStatus('abm_2026', 'ready')
    register('extra', { source: 'handle' })
    setStatus('extra', 'ready')

    setBaseline('abm_2026')
    unregister('extra')
    expect(getBaseline()).toBe('abm_2026')
  })
})
