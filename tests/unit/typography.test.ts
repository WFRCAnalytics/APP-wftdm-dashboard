import { describe, expect, it } from 'vitest'

import { prettyOperators as p } from '../../src/services/typography'

describe('prettyOperators', () => {
  it('turns comparison operators into symbols', () => {
    expect(p('Autos >= Workers')).toBe('Autos ≥ Workers')
    expect(p('a <= b != c <> d ~= e')).toBe('a ≤ b ≠ c ≠ d ≈ e')
  })
  it('turns arrows, plus/minus and punctuation', () => {
    expect(p('home -> work')).toBe('home → work')
    expect(p('a <-> b <=> c => d')).toBe('a ↔ b ⇔ c ⇒ d')
    expect(p('x <- y')).toBe('x ← y')
    expect(p('5 +/- 2')).toBe('5 ± 2')
    expect(p('Loading...')).toBe('Loading…')
    expect(p('2020--2025')).toBe('2020–2025')
    expect(p('wait --- what')).toBe('wait — what')
  })
  it('uses a true minus for negative numbers and an en dash for spaced ranges', () => {
    expect(p('-12.5')).toBe('−12.5')
    expect(p('change (-3)')).toBe('change (−3)')
    expect(p('10 - 20')).toBe('10 – 20')
  })
  it('leaves ambiguous or ordinary text alone', () => {
    expect(p('Autos < Workers')).toBe('Autos < Workers')
    expect(p('a<-5')).toBe('a<-5')
    expect(p('A-1')).toBe('A-1')
    expect(p('2020-01-31')).toBe('2020-01-31')
    expect(p('Zero Autos')).toBe('Zero Autos')
    expect(p('a....b')).toBe('a....b')
  })
})
