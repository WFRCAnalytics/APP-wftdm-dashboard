import { describe, expect, it } from 'vitest'

import { allHidden, landingIndex, listedPages } from '../../src/config'

const pages = (...flags: (boolean | undefined)[]) => flags.map((hidden) => ({ hidden }))

describe('listedPages', () => {
  it('lists every page when none is hidden', () => {
    expect(listedPages(pages(undefined, false, undefined))).toEqual([0, 1, 2])
  })

  it('leaves a hidden page out without renumbering the others', () => {
    expect(listedPages(pages(false, true, false))).toEqual([0, 2])
  })

  it('lists a single page whether or not it is hidden', () => {
    expect(listedPages(pages(true))).toEqual([0])
    expect(listedPages(pages(false))).toEqual([0])
  })

  it('lists them all when every one of several is hidden', () => {
    expect(listedPages(pages(true, true, true))).toEqual([0, 1, 2])
  })

  it('handles no pages', () => {
    expect(listedPages([])).toEqual([])
  })
})

describe('landingIndex', () => {
  it('is the first page that is not hidden', () => {
    expect(landingIndex(pages(true, false, false))).toBe(1)
    expect(landingIndex(pages(false, true))).toBe(0)
  })

  it('is the only page even when hidden, and 0 for every-page-hidden or no pages', () => {
    expect(landingIndex(pages(true))).toBe(0)
    expect(landingIndex(pages(true, true))).toBe(0)
    expect(landingIndex([])).toBe(0)
  })
})

describe('allHidden', () => {
  it('is true only for several pages that are all hidden', () => {
    expect(allHidden(pages(true, true))).toBe(true)
    expect(allHidden(pages(true))).toBe(false)
    expect(allHidden(pages(true, false))).toBe(false)
    expect(allHidden([])).toBe(false)
  })
})
