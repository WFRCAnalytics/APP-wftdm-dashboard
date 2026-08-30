import { describe, it, expect, vi, beforeEach } from 'vitest'

// filterState.js is a module-level singleton (Map instances live at module
// scope) — re-import fresh per test via vi.resetModules() so tests don't
// leak state into each other.
async function freshFilterState() {
  vi.resetModules()
  return import('../../src/state/filterState.js')
}

describe('filterState', () => {
  let filterState
  beforeEach(async () => {
    filterState = await freshFilterState()
  })

  it('notifies a subscriber on its exact id exactly once per set(), and not an unrelated id', () => {
    const purposeSub = vi.fn()
    const incomeSub = vi.fn()
    filterState.subscribe(['purpose'], purposeSub)
    filterState.subscribe(['income'], incomeSub)

    filterState.set('purpose', 'HBW')

    expect(purposeSub).toHaveBeenCalledTimes(1)
    expect(purposeSub).toHaveBeenCalledWith('purpose', 'HBW')
    expect(incomeSub).not.toHaveBeenCalled()
  })

  it("notifies a '*' wildcard subscriber on any set()", () => {
    const wildcardSub = vi.fn()
    filterState.subscribe(['*'], wildcardSub)

    filterState.set('purpose', 'HBW')
    filterState.set('income', 'Low')

    expect(wildcardSub).toHaveBeenCalledTimes(2)
    expect(wildcardSub).toHaveBeenNthCalledWith(1, 'purpose', 'HBW')
    expect(wildcardSub).toHaveBeenNthCalledWith(2, 'income', 'Low')
  })

  it('stores a value set before any subscriber exists, readable later via get()', () => {
    filterState.set('purpose', 'HBW')
    // No subscriber was ever registered for 'purpose' before this set().
    filterState.subscribe(['purpose'], vi.fn())

    expect(filterState.get('purpose')).toBe('HBW')
  })

  it('stops notifying a subscriber after it unsubscribes', () => {
    const sub = vi.fn()
    const unsubscribe = filterState.subscribe(['purpose'], sub)

    filterState.set('purpose', 'HBW')
    unsubscribe()
    filterState.set('purpose', 'HBOO')

    expect(sub).toHaveBeenCalledTimes(1)
  })

  it('getAll() returns a plain-object snapshot of every stored value', () => {
    filterState.set('purpose', 'HBW')
    filterState.set('income', 'Low')

    expect(filterState.getAll()).toEqual({ purpose: 'HBW', income: 'Low' })
  })
})
