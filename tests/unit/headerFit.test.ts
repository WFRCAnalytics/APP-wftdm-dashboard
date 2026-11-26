import { describe, expect, it } from 'vitest'

import { headerFit } from '@/lib/headerFit'

describe('headerFit', () => {
  it('keeps every control on the title row when they and the full view switch fit', () => {
    expect(headerFit(900, [160, 200], 300, 8)).toBe(2)
  })

  it('moves the last controls down before the view switch loses its labels', () => {
    // 300 + 168 = 468 fits, + 208 = 676 does not
    expect(headerFit(600, [160, 200], 300, 8)).toBe(1)
    expect(headerFit(400, [160, 200], 300, 8)).toBe(0)
  })

  it('keeps the priority order: a later, smaller control never stays up while an earlier one moves', () => {
    expect(headerFit(420, [300, 20], 100, 8)).toBe(1)
    expect(headerFit(380, [300, 20], 100, 8)).toBe(0)
  })

  it('without a view switch the controls use the whole row', () => {
    expect(headerFit(400, [160, 200], 0, 8)).toBe(2)
  })

  it('moves every control down when the row has no room at all', () => {
    expect(headerFit(-50, [160, 200], 300, 8)).toBe(0)
  })
})
