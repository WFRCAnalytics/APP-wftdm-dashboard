import { describe, expect, it } from 'vitest'

import { fileName, toCsv, toTsv } from '@/services/exportTile'

describe('toCsv', () => {
  it('writes a header from the first-seen columns, quotes when needed and leaves blanks for gaps', () => {
    const csv = toCsv([
      { scenario: 'A, B', trips: 12 },
      { scenario: 'He said "hi"', share: 0.5, trips: 7n },
    ])
    expect(csv.split('\r\n')).toEqual(['scenario,trips,share', '"A, B",12,', '"He said ""hi""",7,0.5', ''])
  })

  it('drops non-finite numbers and nulls', () => {
    expect(toCsv([{ a: NaN, b: null, c: undefined, d: 1 }])).toBe('a,b,c,d\r\n,,,1\r\n')
  })
})

describe('toTsv', () => {
  it('uses tabs and keeps commas inside quoted text', () => {
    expect(toTsv([{ x: 'a, b', y: 2 }])).toBe('x\ty\na, b\t2\n')
  })
})

describe('fileName', () => {
  it('joins readable, lower-case words and removes separators and trailing dots', () => {
    expect(fileName(['Mode share', 'ActivitySim: Baseline, TAZ 1 Density +40%', 2036], 'csv')).toBe('mode-share-activitysim-baseline-taz-1-density-40-2036.csv')
    expect(fileName(['a/b\c..'], 'png')).toBe('abc.png')
    expect(fileName([undefined, ''], 'svg')).toBe('export.svg')
  })
})
