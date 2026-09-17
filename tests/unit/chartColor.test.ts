import { describe, expect, it } from 'vitest'
import { schemeSet2, schemeTableau10 } from 'd3-scale-chromatic'

import { resolveNamedColorScheme } from '@/panels/chartColor'

// 061-appearance-controls: replaces sankeyColor.test.ts/
// hierarchyColor.test.ts/polarChartColor.test.ts (three near-identical
// copies of the same coverage, one per now-deleted duplicate module).

describe('resolveNamedColorScheme', () => {
  it('resolves "Tableau10" to the real, correct d3-scale-chromatic array', () => {
    expect(resolveNamedColorScheme('Tableau10')).toBe(schemeTableau10)
    expect(resolveNamedColorScheme('Tableau10')).toHaveLength(10)
  })

  it('resolves each of the five new real ColorBrewer schemes', () => {
    expect(resolveNamedColorScheme('Set1')).toBeDefined()
    expect(resolveNamedColorScheme('Set2')).toBeDefined()
    expect(resolveNamedColorScheme('Paired')).toBeDefined()
    expect(resolveNamedColorScheme('Dark2')).toBeDefined()
    expect(resolveNamedColorScheme('Accent')).toBeDefined()
  })

  it('returns undefined for an omitted color_scheme, with colorblindSafe omitted/false', () => {
    expect(resolveNamedColorScheme(undefined)).toBeUndefined()
    expect(resolveNamedColorScheme(undefined, { colorblindSafe: false })).toBeUndefined()
  })

  it('returns undefined for an unrecognized color_scheme name — never throws', () => {
    expect(resolveNamedColorScheme('NotARealScheme')).toBeUndefined()
  })

  it('with colorblindSafe true and no recognized scheme, returns the real Set2 colorblind-safe pool', () => {
    expect(resolveNamedColorScheme(undefined, { colorblindSafe: true })).toBe(schemeSet2)
    expect(resolveNamedColorScheme('NotARealScheme', { colorblindSafe: true })).toBe(schemeSet2)
  })

  it('an explicit, recognized scheme always wins over colorblindSafe — an author choice is never overridden', () => {
    expect(resolveNamedColorScheme('Tableau10', { colorblindSafe: true })).toBe(schemeTableau10)
  })
})

// resolveCategoryFallbackColors() is deliberately NOT unit-tested here —
// it reads getComputedStyle() against a real, mounted element, which
// isn't meaningfully available in this suite's Node test environment
// (vitest.config.js's `environment: 'node'`), matching the exact
// established precedent for this logic before consolidation: none of the
// four per-panel resolveFallbackColors() functions this replaces had a
// unit test either — the "no color_scheme configured -> falls back to
// real token colors" path is covered by each panel type's own Playwright
// spec instead (sankeyPanel.spec.ts, hierarchicalChartTheming.spec.ts,
// pieChartPanel.spec.ts, radarChartPanel.spec.ts), against a real browser.
