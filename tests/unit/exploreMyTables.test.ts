import { describe, expect, it } from 'vitest'
import { slugify } from '../../src/explore/sql/myTables.ts'

describe('slugify', () => {
  it('lower-cases and replaces unsafe characters', () => {
    expect(slugify('My Join: Households + Vehicles!')).toBe('my_join_households_vehicles')
  })
  it('trims underscores and limits the length', () => {
    expect(slugify('  __a__  ')).toBe('a')
    expect(slugify('x'.repeat(80))).toHaveLength(48)
  })
  it('returns an empty slug for an unusable name', () => {
    expect(slugify('***')).toBe('')
  })
})
