import { describe, expect, it } from 'vitest'
import { basicSql, compact, detailSql, shapeProfile } from '../../src/explore/profile/profile.ts'

const rel = '(SELECT * FROM "t") AS r'

describe('profile SQL', () => {
  it('asks numbers for quartiles and a histogram', () => {
    expect(basicSql(rel, 'trips', 'integer')).toContain('quantile_cont(CAST("trips" AS DOUBLE), 0.5)')
    const d = detailSql(rel, 'trips', 'integer', { lo: 0, hi: 120 })
    expect(d).toContain('floor((CAST("trips" AS DOUBLE) - 0) / 10)')
    expect(d).toContain('GROUP BY 1')
  })
  it('summarises dates by epoch seconds and text by length', () => {
    expect(basicSql(rel, 'd', 'date')).toContain('epoch(CAST("d" AS TIMESTAMP))')
    expect(basicSql(rel, 'note', 'text')).toContain('length(CAST("note" AS VARCHAR))')
  })
  it('asks categories and booleans for top values, ids only for uniqueness', () => {
    expect(detailSql(rel, 'mode', 'category', {})).toContain('ORDER BY c DESC')
    expect(detailSql(rel, 'hh_id', 'id', {})).toBeNull()
    expect(basicSql(rel, 'hh_id', 'id')).toContain('min(CAST("hh_id" AS VARCHAR))')
  })
  it('skips the histogram when a column is all null', () => {
    expect(detailSql(rel, 'x', 'integer', { lo: null })).toBeNull()
  })
  it('quotes awkward names', () => {
    expect(basicSql(rel, 'a "b"', 'category')).toContain('"a ""b"""')
  })
})

describe('shapeProfile', () => {
  it('shapes a number column', () => {
    const p = shapeProfile('integer', { n: 100n, nn: 90n, d: 40n, lo: 0, hi: 120, q1: 10, med: 50, q3: 90, mean: 55, sd: 20 }, [{ b: 0n, c: 5n }, { b: 11, c: 10 }])
    expect(p.nulls).toBe(10)
    expect(p.missPct).toBe(10)
    expect(p.bars).toHaveLength(12)
    expect(Math.max(...p.bars)).toBe(1)
    expect(p.hist?.mid).toBe('50 median')
    expect(p.stats.map((s) => s.k)).toEqual(['Rows', 'Missing', 'Distinct', 'Min', 'Median', '25%', '75%', 'Max', 'Mean', 'Std dev'])
  })
  it('shapes dates', () => {
    const p = shapeProfile('date', { n: 10, nn: 10, d: 10, lo: 1704067200, hi: 1706745600, med: 1705000000, q1: 0, q3: 0, mean: 0, sd: 0 }, [{ b: 0, c: 3 }])
    expect(p.meta).toBe('2024-01-01 to 2024-02-01')
    expect(p.stats.find((s) => s.k === 'Span')?.v).toBe('31 days')
  })
  it('shapes a boolean with true and false shares', () => {
    const p = shapeProfile('boolean', { n: 100, nn: 100, d: 2 }, [{ v: 'true', c: 62 }, { v: 'false', c: 38 }])
    expect(p.meta).toBe('62% true')
    expect(p.list?.items.map((i) => i.label)).toEqual(['true', 'false'])
  })
  it('orders an ordinal by its levels', () => {
    const p = shapeProfile('ordinal', { n: 10, nn: 10, d: 2 }, [{ v: 'High', c: 6 }, { v: 'Low', c: 4 }], ['Low', 'High'])
    expect(p.list?.title).toBe('Rows by level')
    expect(p.list?.items.map((i) => i.label)).toEqual(['Low', 'High'])
  })
  it('shapes an id as a uniqueness figure', () => {
    const p = shapeProfile('id', { n: 800, nn: 800, d: 800, minv: 'H10001', maxv: 'H10800' })
    expect(p.meta).toBe('unique on every row')
    expect(p.bars).toEqual([])
  })
  it('formats compact numbers', () => {
    expect(compact(1234)).toBe('1.2k')
    expect(compact(2_500_000)).toBe('2.5M')
  })
})
