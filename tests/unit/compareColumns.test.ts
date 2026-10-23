import { describe, expect, it } from 'vitest'
import { minCellWidth, pickColumns } from '../../src/panels/compareStrategy.ts'
import type { PanelConfig } from '../../src/layout/types.ts'

const map = 280
describe('pickColumns', () => {
  it('puts four maps in one row when they fit', () => {
    expect(pickColumns({ total: 4, width: 1200, minCell: map, tabbed: false })).toBe(4)
  })
  it('falls back to 2x2, never 3+1', () => {
    expect(pickColumns({ total: 4, width: 900, minCell: map, tabbed: false })).toBe(2)
  })
  it('caps tabbed pages at two columns', () => {
    expect(pickColumns({ total: 4, width: 1400, minCell: map, tabbed: true })).toBe(2)
  })
  it('stacks on a phone', () => {
    expect(pickColumns({ total: 4, width: 360, minCell: map, tabbed: false })).toBe(1)
  })
  it('never exceeds the cell count and defaults to two before measuring', () => {
    expect(pickColumns({ total: 2, width: 2000, minCell: map, tabbed: false })).toBe(2)
    expect(pickColumns({ total: 1, width: 2000, minCell: map, tabbed: false })).toBe(1)
    expect(pickColumns({ total: 4, width: 0, minCell: map, tabbed: false })).toBe(2)
  })
  it('honours a manual Layout choice', () => {
    expect(pickColumns({ total: 4, width: 900, minCell: map, tabbed: false, layout: 'row' })).toBe(4)
    expect(pickColumns({ total: 4, width: 1600, minCell: map, tabbed: false, layout: 'grid' })).toBe(2)
    expect(pickColumns({ total: 4, width: 1400, minCell: map, tabbed: true, layout: 'row' })).toBe(4)
    // a forced row that would crush the cells falls back to auto
    expect(pickColumns({ total: 4, width: 360, minCell: map, tabbed: false, layout: 'row' })).toBe(1)
  })
  it('maps need more width than charts', () => {
    expect(minCellWidth({ type: 'zonemap' } as unknown as PanelConfig)).toBe(280)
    expect(minCellWidth({ type: 'chart', kind: 'zone-map' } as unknown as PanelConfig)).toBe(280)
    expect(minCellWidth({ type: 'chart', kind: 'rank-bars' } as unknown as PanelConfig)).toBe(220)
  })
})
