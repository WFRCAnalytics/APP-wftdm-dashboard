import { describe, expect, it } from 'vitest'

import { applyOrder } from '../../src/charts/builder/compile'

describe('applyOrder', () => {
  const cats = ['High', 'Low', 'Medium', 'Very High', 'Very Low']
  it('keeps the alphabetical order when no order is chosen', () => {
    expect(applyOrder(cats, undefined)).toEqual(cats)
    expect(applyOrder(cats, [])).toEqual(cats)
  })
  it('puts the chosen order first', () => {
    const order = ['Very Low', 'Low', 'Medium', 'High', 'Very High']
    expect(applyOrder(cats, order)).toEqual(order)
  })
  it('puts values the order does not name after it, and ignores unknown ones', () => {
    expect(applyOrder(cats, ['Medium', 'Gone', 'Low'])).toEqual(['Medium', 'Low', 'High', 'Very High', 'Very Low'])
  })
})
