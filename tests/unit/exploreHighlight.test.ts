import { describe, expect, it } from 'vitest'
import { highlightSql } from '../../src/explore/sql/highlight.ts'

describe('highlightSql', () => {
  it('classifies keywords, functions, strings, numbers and comments', () => {
    const t = highlightSql(`SELECT SUM(x) FROM t WHERE a = 'b' AND n > 3 -- note`)
    const by = (s: string) => t.find((k) => k.t === s)?.c
    expect(by('SELECT')).toBe('k')
    expect(by('SUM')).toBe('f')
    expect(by(`'b'`)).toBe('s')
    expect(by('3')).toBe('n')
    expect(by('-- note')).toBe('c')
    expect(by('x')).toBe('')
  })
  it('keeps the text intact', () => {
    const sql = 'SELECT a,\n  b\nFROM "x"'
    expect(highlightSql(sql).map((k) => k.t).join('').replace('​', '')).toBe(sql)
  })
})
