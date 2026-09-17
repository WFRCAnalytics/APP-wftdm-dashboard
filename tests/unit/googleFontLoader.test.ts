// @vitest-environment jsdom
//
// 061-appearance-controls — unlike chartColor.ts's deliberately-untested
// resolveCategoryFallbackColors() (research.md: getComputedStyle()-based
// CSS custom-property resolution isn't reliably testable outside a real
// browser), this module's DOM operations are plain element/attribute
// get-set calls with no CSS cascade/computation involved — jsdom (already
// an installed devDependency) handles these reliably, so a per-file
// environment override is used here instead of leaving this untested.
import { afterEach, describe, expect, it } from 'vitest'

import { clearGoogleFont, ensureGoogleFontLoaded } from '@/panels/googleFontLoader'

describe('ensureGoogleFontLoaded / clearGoogleFont', () => {
  afterEach(() => {
    clearGoogleFont('body')
    clearGoogleFont('heading')
    clearGoogleFont('mono')
  })

  it('creates a stable-id <link> with the correct CSS2 URL and sets the matching --font-* property', () => {
    ensureGoogleFontLoaded('body', 'Merriweather')
    const link = document.getElementById('google-font-body') as HTMLLinkElement
    expect(link).not.toBeNull()
    expect(link.rel).toBe('stylesheet')
    expect(link.href).toBe('https://fonts.googleapis.com/css2?family=Merriweather:wght@400;500;600;700&display=swap')
    expect(document.documentElement.style.getPropertyValue('--font-body')).toBe('"Merriweather", sans-serif')
  })

  it('the monospace role falls back to the monospace generic family', () => {
    ensureGoogleFontLoaded('mono', 'Fira Code')
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toBe('"Fira Code", monospace')
  })

  it('re-selecting updates the same tag rather than creating a second one', () => {
    ensureGoogleFontLoaded('heading', 'Merriweather')
    ensureGoogleFontLoaded('heading', 'Lato')
    const links = document.querySelectorAll('#google-font-heading')
    expect(links.length).toBe(1)
    expect((links[0] as HTMLLinkElement).href).toContain('family=Lato')
    expect(document.documentElement.style.getPropertyValue('--font-heading')).toBe('"Lato", sans-serif')
  })

  it('encodes a multi-word family name with a "+" separator', () => {
    ensureGoogleFontLoaded('body', 'Source Sans Pro')
    const link = document.getElementById('google-font-body') as HTMLLinkElement
    expect(link.href).toContain('family=Source+Sans+Pro')
  })

  it('clearGoogleFont removes the link and the inline property, reverting to the stylesheet default', () => {
    ensureGoogleFontLoaded('body', 'Merriweather')
    clearGoogleFont('body')
    expect(document.getElementById('google-font-body')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--font-body')).toBe('')
  })

  it('clearing one role never touches another', () => {
    ensureGoogleFontLoaded('body', 'Merriweather')
    ensureGoogleFontLoaded('mono', 'Fira Code')
    clearGoogleFont('body')
    expect(document.getElementById('google-font-mono')).not.toBeNull()
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toBe('"Fira Code", monospace')
  })
})
