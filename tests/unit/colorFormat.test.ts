import { describe, expect, it } from 'vitest'

import { clampByte, parseHexColor } from '@/lib/colorFormat'

describe('clampByte', () => {
  it('passes an in-range value through unchanged', () => {
    expect(clampByte(128)).toBe(128)
    expect(clampByte(0)).toBe(0)
    expect(clampByte(255)).toBe(255)
  })

  it('clamps a value below 0 up to 0', () => {
    expect(clampByte(-10)).toBe(0)
  })

  it('clamps a value above 255 down to 255', () => {
    expect(clampByte(300)).toBe(255)
  })

  it('rounds a fractional value', () => {
    expect(clampByte(127.6)).toBe(128)
  })

  it('treats NaN as 0, never propagating an invalid number', () => {
    expect(clampByte(NaN)).toBe(0)
  })
})

describe('parseHexColor', () => {
  it('parses a valid 6-digit hex color, with a leading #', () => {
    expect(parseHexColor('#ff0000')).toEqual([255, 0, 0])
  })

  it('parses a valid 6-digit hex color, without a leading #', () => {
    expect(parseHexColor('00ff00')).toEqual([0, 255, 0])
  })

  it('parses a valid 3-digit shorthand hex color', () => {
    expect(parseHexColor('#f00')).toEqual([255, 0, 0])
  })

  it('is case-insensitive', () => {
    expect(parseHexColor('#FF0000')).toEqual([255, 0, 0])
  })

  it('returns null for an incomplete hex color', () => {
    expect(parseHexColor('#ff')).toBeNull()
  })

  it('returns null for an invalid (non-hex) string', () => {
    expect(parseHexColor('zzzzzz')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseHexColor('')).toBeNull()
  })
})
