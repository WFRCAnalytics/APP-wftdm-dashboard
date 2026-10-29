import { describe, expect, it } from 'vitest'

import { prettyOperators } from '../../src/services/typography'

describe('prettyOperators', () => {
  it('turns two-character operators into their symbols', () => {
    expect(prettyOperators('Autos >= Workers')).toBe('Autos ≥ Workers')
    expect(prettyOperators('a <= b != c')).toBe('a ≤ b ≠ c')
    expect(prettyOperators('home -> work')).toBe('home → work')
  })
  it('leaves other text alone', () => {
    expect(prettyOperators('Autos < Workers')).toBe('Autos < Workers')
    expect(prettyOperators('Zero Autos')).toBe('Zero Autos')
  })
})
