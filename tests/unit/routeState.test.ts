import { describe, expect, it } from 'vitest'

import { assignSlugs, buildHash, parseHash, slugify } from '@/state/routeState'

describe('routeState', () => {
  it('slugifies tab names', () => {
    expect(slugify('Person/Household Models')).toBe('person-household-models')
    expect(slugify(' ')).toBe('')
  })

  it('assigns unique slugs: header.slug, then the tab name, then page-n', () => {
    expect(assignSlugs([{ tab: 'Summary' }, { tab: 'Explore', slug: 'sandbox' }, { tab: ' ' }, { tab: 'Summary' }])).toEqual([
      'summary',
      'sandbox',
      'page-3',
      'summary-2',
    ])
  })

  it('parses page and section addresses, and the older bare section form', () => {
    expect(parseHash('#/summary/time')).toEqual({ page: 'summary', section: 'time' })
    expect(parseHash('#/explore')).toEqual({ page: 'explore', section: undefined })
    expect(parseHash('#time')).toEqual({ section: 'time' })
    expect(parseHash('')).toEqual({})
  })

  it('builds addresses', () => {
    expect(buildHash('summary')).toBe('#/summary')
    expect(buildHash('summary', 'time')).toBe('#/summary/time')
  })
})
