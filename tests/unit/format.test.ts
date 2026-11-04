import { describe, expect, it } from 'vitest'

import { compact, compactThousands, exact, signed } from '@/charts/lib/format'

describe('chart number formats', () => {
  it('compacts raw counts', () => {
    expect(compact(950)).toBe('950')
    expect(compact(1200)).toBe('1.2k')
    expect(compact(12400)).toBe('12k')
    expect(compact(1_250_000)).toBe('1.3M')
    expect(compact(12_000_000)).toBe('12M')
    expect(compact(-3400)).toBe('-3.4k')
    expect(compact(1_200_000_000)).toBe('1.2B')
    expect(compact(25_000_000_000)).toBe('25B')
    expect(compact(1_200_000_000_000)).toBe('1.2T')
    expect(compact(-30_000_000_000_000)).toBe('-30T')
  })

  it('compacts values given in thousands', () => {
    expect(compactThousands(812.4)).toBe('812k')
    expect(compactThousands(9810)).toBe('9.81M')
    expect(compactThousands(1_200_000)).toBe('1.20B')
    expect(compactThousands(1_200_000_000)).toBe('1.20T')
  })

  it('writes exact numbers with separators', () => {
    expect(exact(12400)).toBe('12,400')
    expect(exact(3.14159)).toBe('3.14')
  })

  it('shows a sign only when the rounded change is not zero', () => {
    expect(signed(3.24)).toBe('+3.2')
    expect(signed(-3.24)).toBe('−3.2')
    expect(signed(0.04)).toBe('0.0')
    expect(signed(-0.04)).toBe('0.0')
    expect(signed(-12, 0, 'k')).toBe('−12k')
    expect(signed(1.2, 1, ' pts')).toBe('+1.2 pts')
  })

  it('drops trailing zeros for axis ticks when asked', () => {
    expect(signed(3, 1, '%', { trim: true })).toBe('+3%')
    expect(signed(0.02, 1, '%', { trim: true })).toBe('0%')
  })
})
