import { describe, expect, it } from 'vitest'
import { schemeTableau10 } from 'd3-scale-chromatic'

import { resolveNamedColorScheme } from '@/panels/sankeyColor'

describe('resolveNamedColorScheme', () => {
  it('resolves "Tableau10" to the real, correct d3-scale-chromatic array', () => {
    expect(resolveNamedColorScheme('Tableau10')).toBe(schemeTableau10)
    expect(resolveNamedColorScheme('Tableau10')).toHaveLength(10)
  })

  it('returns undefined for an omitted color_scheme', () => {
    expect(resolveNamedColorScheme(undefined)).toBeUndefined()
  })

  it('returns undefined for an unrecognized color_scheme name — never throws', () => {
    expect(resolveNamedColorScheme('NotARealScheme')).toBeUndefined()
  })
})
