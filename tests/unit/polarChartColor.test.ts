import { describe, expect, it } from 'vitest'
import { schemeTableau10 } from 'd3-scale-chromatic'

import { resolvePolarColorScheme } from '@/panels/polarChartColor'

describe('resolvePolarColorScheme', () => {
  it('resolves "Tableau10" to the real, correct d3-scale-chromatic array', () => {
    expect(resolvePolarColorScheme('Tableau10')).toBe(schemeTableau10)
    expect(resolvePolarColorScheme('Tableau10')).toHaveLength(10)
  })

  it('returns undefined for an omitted color_scheme', () => {
    expect(resolvePolarColorScheme(undefined)).toBeUndefined()
  })

  it('returns undefined for an unrecognized color_scheme name — never throws', () => {
    expect(resolvePolarColorScheme('NotARealScheme')).toBeUndefined()
  })
})
