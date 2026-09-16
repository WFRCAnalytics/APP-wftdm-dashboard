import { describe, it, expect } from 'vitest'
import { buildHierarchy } from '../../src/panels/hierarchyData.ts'

// 058-hierarchical-chart-panels — see data-model.md §4 and research.md §4
describe('hierarchyData.buildHierarchy', () => {
  it('single-level (degenerate) hierarchy: one path column, leaves valued directly', () => {
    const rows = [
      { primary_purpose: 'work', trips: 5878 },
      { primary_purpose: 'shopping', trips: 2230 },
    ]
    const result = buildHierarchy(rows, { path: ['primary_purpose'], value: 'trips' })
    expect(result).toEqual({
      name: 'root',
      children: [
        { name: 'work', value: 5878 },
        { name: 'shopping', value: 2230 },
      ],
    })
  })

  it('the real 2-level purpose->mode shape: nests correctly, first-seen order preserved', () => {
    const rows = [
      { primary_purpose: 'work', major_trip_mode: 'SOV', trips: 107 },
      { primary_purpose: 'work', major_trip_mode: 'Transit', trips: 2465 },
      { primary_purpose: 'shopping', major_trip_mode: 'SOV', trips: 50 },
    ]
    const result = buildHierarchy(rows, { path: ['primary_purpose', 'major_trip_mode'], value: 'trips' })
    expect(result).toEqual({
      name: 'root',
      children: [
        {
          name: 'work',
          children: [
            { name: 'SOV', value: 107 },
            { name: 'Transit', value: 2465 },
          ],
        },
        {
          name: 'shopping',
          children: [{ name: 'SOV', value: 50 }],
        },
      ],
    })
  })

  it('a missing/non-numeric value defaults to 0, never NaN, never a dropped row', () => {
    const rows = [
      { primary_purpose: 'work', trips: null },
      { primary_purpose: 'shopping', trips: 'not-a-number' },
      { primary_purpose: 'social', trips: undefined },
    ]
    const result = buildHierarchy(rows, { path: ['primary_purpose'], value: 'trips' })
    expect(result.children).toEqual([
      { name: 'work', value: 0 },
      { name: 'shopping', value: 0 },
      { name: 'social', value: 0 },
    ])
  })

  it('two rows sharing the same full path tuple sum correctly at the leaf', () => {
    const rows = [
      { primary_purpose: 'work', major_trip_mode: 'SOV', trips: 60 },
      { primary_purpose: 'work', major_trip_mode: 'SOV', trips: 47 },
    ]
    const result = buildHierarchy(rows, { path: ['primary_purpose', 'major_trip_mode'], value: 'trips' })
    expect(result.children).toEqual([{ name: 'work', children: [{ name: 'SOV', value: 107 }] }])
  })

  it('output is a valid d3.hierarchy() input: root has no value, leaves have no children', () => {
    const rows = [{ primary_purpose: 'work', major_trip_mode: 'SOV', trips: 107 }]
    const result = buildHierarchy(rows, { path: ['primary_purpose', 'major_trip_mode'], value: 'trips' })
    expect(result.value).toBeUndefined()
    expect(result.children).toBeDefined()
    const leaf = result.children![0].children![0]
    expect(leaf.children).toBeUndefined()
    expect(leaf.value).toBe(107)
  })
})
