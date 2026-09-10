// T002/T003 (009-scenario-manager): appState.ts's new subscribe()/notify()
// mechanism. Extends appState.ts's existing register/setStatus/setActive/
// unregister behavior with a plain wildcard pub/sub, mirroring
// filterState.ts's own already-proven shape (research.md §1) — chosen over
// a key-based remount specifically to preserve panel-local state (FR-008).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearLabel,
  get,
  getBaseline,
  listByDisplayOrder,
  moveScenario,
  register,
  reorderScenario,
  setActive,
  setBaseline,
  setLabel,
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
    register('sub_test_1', { source: 'handle', path: 'test/sub_test_1' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fires on setStatus()', () => {
    register('sub_test_2', { source: 'handle', path: 'test/sub_test_2' })
    const fn = vi.fn()
    subscribe(fn)
    setStatus('sub_test_2', 'ready')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fires on setActive()', () => {
    register('sub_test_3', { source: 'handle', path: 'test/sub_test_3' })
    const fn = vi.fn()
    subscribe(fn)
    setActive('sub_test_3', true)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fires on unregister()', () => {
    register('sub_test_4', { source: 'handle', path: 'test/sub_test_4' })
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
    register('sub_test_1', { source: 'handle', path: 'test/sub_test_1' })
    expect(fn).not.toHaveBeenCalled()
  })

  it('notifies every subscriber, not just the first', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    subscribe(fn1)
    subscribe(fn2)
    register('sub_test_1', { source: 'handle', path: 'test/sub_test_1' })
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
    register('abm_2026', { source: 'url', path: 'test/abm_2026' })
    register('base_tbm', { source: 'url', path: 'test/base_tbm' })

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
    register('observed', { source: 'url', pinned: true, path: 'test/observed' })
    setStatus('observed', 'ready')
    expect(getBaseline()).toBeUndefined()

    register('abm_2026', { source: 'url', path: 'test/abm_2026' })
    setStatus('abm_2026', 'ready')
    expect(getBaseline()).toBe('abm_2026')
  })

  it('automatic default does not move once resolved, even as more scenarios load', () => {
    register('abm_2026', { source: 'url', path: 'test/abm_2026' })
    setStatus('abm_2026', 'ready')
    expect(getBaseline()).toBe('abm_2026')

    register('base_tbm', { source: 'url', path: 'test/base_tbm' })
    setStatus('base_tbm', 'ready')
    expect(getBaseline()).toBe('abm_2026')
  })

  it('automatic default skips a scenario that is not yet ready', () => {
    register('not_ready', { source: 'url', path: 'test/not_ready' }) // status stays 'registering'
    expect(getBaseline()).toBeUndefined()

    register('abm_2026', { source: 'url', path: 'test/abm_2026' })
    setStatus('abm_2026', 'ready')
    expect(getBaseline()).toBe('abm_2026')
  })

  it('an explicit baseline can target a pinned scenario if chosen deliberately', () => {
    register('observed', { source: 'url', pinned: true, path: 'test/observed' })
    setStatus('observed', 'ready')
    setBaseline('observed')
    expect(getBaseline()).toBe('observed')
  })

  it('removing the explicit baseline falls back to the same automatic-default rule', () => {
    register('abm_2026', { source: 'handle', path: 'test/abm_2026' })
    setStatus('abm_2026', 'ready')
    register('base_tbm', { source: 'url', path: 'test/base_tbm' })
    setStatus('base_tbm', 'ready')

    setBaseline('base_tbm')
    expect(getBaseline()).toBe('base_tbm')

    unregister('base_tbm')
    expect(getBaseline()).toBe('abm_2026')
  })

  it('removing the ONLY remaining scenario after it held the baseline resolves to undefined', () => {
    register('abm_2026', { source: 'handle', path: 'test/abm_2026' })
    setStatus('abm_2026', 'ready')
    setBaseline('abm_2026')
    expect(getBaseline()).toBe('abm_2026')

    unregister('abm_2026')
    expect(getBaseline()).toBeUndefined()
  })

  it('removing a scenario that is NOT the current baseline leaves it completely unaffected', () => {
    register('abm_2026', { source: 'url', path: 'test/abm_2026' })
    setStatus('abm_2026', 'ready')
    register('extra', { source: 'handle', path: 'test/extra' })
    setStatus('extra', 'ready')

    setBaseline('abm_2026')
    unregister('extra')
    expect(getBaseline()).toBe('abm_2026')
  })
})

// 020-settings-modal (T006, foundational): moveScenario()/listByDisplayOrder()/
// setLabel()/clearLabel(), plus the two structural guarantees FR-008 and
// FR-018 depend on. Self-contained afterEach, same convention as the
// getBaseline/setBaseline describe above.
describe('appState.listByDisplayOrder / moveScenario', () => {
  afterEach(() => {
    for (const name of ['a', 'b', 'c']) {
      unregister(name)
    }
  })

  it('defaults to registration order', () => {
    register('a', { source: 'url', path: 'test/a' })
    register('b', { source: 'url', path: 'test/b' })
    register('c', { source: 'url', path: 'test/c' })
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['a', 'b', 'c'])
  })

  it('moveScenario swaps with the neighbor in DISPLAY order', () => {
    register('a', { source: 'url', path: 'test/a' })
    register('b', { source: 'url', path: 'test/b' })
    register('c', { source: 'url', path: 'test/c' })

    moveScenario('c', 'up')
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['a', 'c', 'b'])

    moveScenario('c', 'up')
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['c', 'a', 'b'])
  })

  it('moveScenario at a boundary is a harmless no-op — no error, no wraparound', () => {
    register('a', { source: 'url', path: 'test/a' })
    register('b', { source: 'url', path: 'test/b' })

    expect(() => moveScenario('a', 'up')).not.toThrow()
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['a', 'b'])

    expect(() => moveScenario('b', 'down')).not.toThrow()
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['a', 'b'])
  })

  it('moveScenario throws on an unregistered name', () => {
    expect(() => moveScenario('nope', 'up')).toThrow(/never registered/)
  })

  it('a single loaded scenario has nothing to reorder', () => {
    register('a', { source: 'url', path: 'test/a' })
    expect(() => moveScenario('a', 'up')).not.toThrow()
    expect(() => moveScenario('a', 'down')).not.toThrow()
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['a'])
  })

  // FR-008 / quickstart.md Scenario 3: reordering must never change which
  // scenario the automatic-default baseline rule resolves to.
  it('FR-008: reordering the display list never changes the automatic-default baseline pick', () => {
    register('a', { source: 'url', path: 'test/a' })
    register('b', { source: 'url', path: 'test/b' })
    setStatus('a', 'ready')
    setStatus('b', 'ready')
    expect(getBaseline()).toBe('a') // earliest-registered, ready, unpinned

    moveScenario('b', 'up')
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['b', 'a'])
    expect(getBaseline()).toBe('a') // UNCHANGED — still registration order
  })

  // FR-018 / quickstart.md Scenario 4: a scenario registering after a
  // reorder always appends at the end of the CURRENT display order.
  it('FR-018: a newly registered scenario always appends last in display order', () => {
    register('a', { source: 'url', path: 'test/a' })
    register('b', { source: 'url', path: 'test/b' })
    moveScenario('b', 'up') // display order: b, a
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['b', 'a'])

    register('c', { source: 'url', path: 'test/c' })
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['b', 'a', 'c'])
  })

  it('removing a scenario discards its display-order position — no orphaned state', () => {
    register('a', { source: 'url', path: 'test/a' })
    register('b', { source: 'url', path: 'test/b' })
    moveScenario('b', 'up')
    unregister('b')
    register('c', { source: 'url', path: 'test/c' })
    // 'b' is gone; 'c' (freshly registered) still appends last after 'a'.
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['a', 'c'])
  })
})

// 037-scenarios-tab-redesign (T005): reorderScenario() — the arbitrary
// from→to move that drag-and-drop needs, and the single reordering code
// path moveScenario() now delegates to (FR-004, data-model.md §2/§3).
describe('appState.reorderScenario', () => {
  afterEach(() => {
    for (const name of ['a', 'b', 'c', 'd']) {
      unregister(name)
    }
  })

  function seed(...names: string[]) {
    for (const n of names) register(n, { source: 'url', path: `test/${n}` })
  }

  it('moves a scenario down to an arbitrary later index', () => {
    seed('a', 'b', 'c', 'd')
    reorderScenario('a', 2)
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves a scenario up to an arbitrary earlier index', () => {
    seed('a', 'b', 'c', 'd')
    reorderScenario('d', 0)
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('moves to the last index', () => {
    seed('a', 'b', 'c')
    reorderScenario('a', 2)
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['b', 'c', 'a'])
  })

  it('clamps an out-of-range targetIndex to the last position', () => {
    seed('a', 'b', 'c')
    reorderScenario('a', 99)
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['b', 'c', 'a'])
  })

  it('clamps a negative targetIndex to the first position', () => {
    seed('a', 'b', 'c')
    reorderScenario('c', -5)
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['c', 'a', 'b'])
  })

  it('moving to the same index is a harmless no-op that still notifies', () => {
    seed('a', 'b', 'c')
    const fn = vi.fn()
    const unsub = subscribe(fn)
    reorderScenario('b', 1)
    unsub()
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['a', 'b', 'c'])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('re-sequences `order` to a dense 0..n-1 range after the move', () => {
    seed('a', 'b', 'c', 'd')
    reorderScenario('a', 3)
    const ordered = listByDisplayOrder()
    expect(ordered.map((s) => s.order)).toEqual([0, 1, 2, 3])
    expect(ordered.map((s) => s.name)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('throws on an unregistered name', () => {
    expect(() => reorderScenario('nope', 0)).toThrow(/never registered/)
  })

  it('never changes the resolved baseline (getBaseline ignores display order)', () => {
    seed('a', 'b', 'c')
    setStatus('a', 'ready')
    setStatus('b', 'ready')
    setStatus('c', 'ready')
    expect(getBaseline()).toBe('a')
    reorderScenario('a', 2)
    reorderScenario('c', 0)
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['c', 'b', 'a'])
    expect(getBaseline()).toBe('a') // UNCHANGED — registration order, not display order
  })

  it('moveScenario still produces its documented one-step behavior after the reimplementation', () => {
    seed('a', 'b', 'c')
    moveScenario('c', 'up')
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['a', 'c', 'b'])
    moveScenario('a', 'up') // boundary — no-op
    expect(listByDisplayOrder().map((s) => s.name)).toEqual(['a', 'c', 'b'])
  })
})

describe('appState.setLabel / clearLabel', () => {
  afterEach(() => {
    unregister('a')
  })

  it('setLabel sets a display label distinct from the real name', () => {
    register('a', { source: 'url', path: 'test/a' })
    setLabel('a', 'Base Year')
    expect(get('a')?.label).toBe('Base Year')
    expect(get('a')?.name).toBe('a') // the real name is untouched
  })

  it('clearLabel resets the label to undefined', () => {
    register('a', { source: 'url', path: 'test/a' })
    setLabel('a', 'Base Year')
    clearLabel('a')
    expect(get('a')?.label).toBeUndefined()
  })

  it('setLabel/clearLabel throw on an unregistered name', () => {
    expect(() => setLabel('nope', 'x')).toThrow(/never registered/)
    expect(() => clearLabel('nope')).toThrow(/never registered/)
  })

  it('removing a scenario discards its label — no orphaned state', () => {
    register('a', { source: 'url', path: 'test/a' })
    setLabel('a', 'Base Year')
    unregister('a')
    expect(get('a')).toBeUndefined()
  })

  // FR-010 / quickstart.md Scenario 5: a label is display-only — it must
  // never be usable as a substitute for the scenario's real `name` when
  // looking the scenario back up (the same lookup every resolution path,
  // sqlExpander.ts's $scenario/$baseline expansion and panelQuery.ts's
  // resolveComparisonScenarioName(), performs).
  it('FR-010: a scenario is never addressable by its label, only its real name', () => {
    register('abm_2026_final_v3', { source: 'url', path: 'test/abm_2026_final_v3' })
    setLabel('abm_2026_final_v3', 'Base Year')
    expect(get('abm_2026_final_v3')?.label).toBe('Base Year')
    expect(get('Base Year')).toBeUndefined()
    unregister('abm_2026_final_v3')
  })
})
