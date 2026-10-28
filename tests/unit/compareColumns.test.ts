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
    // a treemap is not a map
    expect(minCellWidth({ type: 'chart', kind: 'treemap' } as unknown as PanelConfig)).toBe(220)
    expect(minCellWidth({ type: 'chart', kind: 'zone-swipe-map' } as unknown as PanelConfig)).toBe(280)
  })
  describe('auto with the body height known: the biggest cells by area, ignoring the caption', () => {
    const a = { minCell: 220, tabbed: false, height: 400 }
    it('puts three charts in a row in a short, narrow tile instead of a 2 + 1 grid', () => {
      expect(pickColumns({ ...a, total: 3, width: 520 })).toBe(3)
    })
    it('keeps a grid when the tile is tall enough for rows to win', () => {
      expect(pickColumns({ ...a, total: 4, width: 520, height: 900 })).toBe(2)
    })
    it('stays on one row of four when it fits, never 3 + 1, and never below the minimum width', () => {
      expect(pickColumns({ ...a, total: 4, width: 1100 })).toBe(4)
      expect(pickColumns({ ...a, total: 3, width: 300 })).toBe(1)
    })
    it('puts three charts in a row on a tabbed page too, where a 2 + 1 grid made them tiny', () => {
      expect(pickColumns({ ...a, total: 3, width: 780, height: 330, tabbed: true })).toBe(3)
    })
    it('leaves maps and a manual Layout choice alone', () => {
      expect(pickColumns({ ...a, total: 3, width: 520, minCell: 280 })).toBe(1)
      expect(pickColumns({ ...a, total: 3, width: 520, layout: 'grid' })).toBe(2)
    })
  })
})
