import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSpec } from '../../src/charts/builder/spec.ts'
import { getExplore, redoCharts, resetExploreForTests, setExplore, undoCharts, updateChart } from '../../src/state/exploreState.ts'

const tab = (id: string) => ({ id, name: id, source: 't:x', spec: defaultSpec() })

describe('undo and redo of chart changes', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); resetExploreForTests() })
  afterEach(() => vi.useRealTimers())

  it('undoes and redoes a change to a chart', () => {
    setExplore({ charts: [tab('c1')] })
    vi.advanceTimersByTime(2000)
    updateChart('c1', (t) => ({ ...t, name: 'Trips' }))
    expect(getExplore().charts[0].name).toBe('Trips')
    undoCharts()
    expect(getExplore().charts[0].name).toBe('c1')
    redoCharts()
    expect(getExplore().charts[0].name).toBe('Trips')
  })

  it('counts steps, and a new change clears what could be redone', () => {
    setExplore({ charts: [tab('c1')] })
    vi.advanceTimersByTime(2000)
    updateChart('c1', (t) => ({ ...t, name: 'A' }))
    vi.advanceTimersByTime(2000)
    updateChart('c1', (t) => ({ ...t, name: 'B' }))
    expect(getExplore().undoDepth).toBe(3)
    undoCharts()
    expect(getExplore().redoDepth).toBe(1)
    vi.advanceTimersByTime(2000)
    updateChart('c1', (t) => ({ ...t, name: 'C' }))
    expect(getExplore().redoDepth).toBe(0)
  })

  it('merges quick edits such as typing into one step', () => {
    setExplore({ charts: [tab('c1')] })
    vi.advanceTimersByTime(2000)
    for (const name of ['T', 'Tr', 'Tri', 'Trip']) { updateChart('c1', (t) => ({ ...t, name })); vi.advanceTimersByTime(100) }
    undoCharts()
    expect(getExplore().charts[0].name).toBe('c1')
  })

  it('keeps adding a tab and editing it as separate steps, even when they follow each other quickly', () => {
    setExplore({ charts: [tab('c1')] })
    updateChart('c1', (t) => ({ ...t, spec: { ...t.spec, mark: 'line' } }))
    updateChart('c1', (t) => ({ ...t, spec: { ...t.spec, sort: 'high' } }))
    expect(getExplore().undoDepth).toBe(3)
    undoCharts()
    expect(getExplore().charts[0].spec.mark).toBe('line')
    expect(getExplore().charts[0].spec.sort).toBe('natural')
  })

  it('goes back to the Data tab when undoing the creation of the open tab', () => {
    setExplore({ charts: [tab('c1')], activeTab: 'c1' })
    undoCharts()
    expect(getExplore().charts).toEqual([])
    expect(getExplore().activeTab).toBe('data')
  })

  it('ignores changes that leave the charts alone and does nothing with empty history', () => {
    setExplore({ page: 3 })
    expect(getExplore().undoDepth).toBe(0)
    undoCharts()
    redoCharts()
    expect(getExplore().page).toBe(3)
  })
})
