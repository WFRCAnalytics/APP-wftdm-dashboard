import { describe, expect, it } from 'vitest'
import { toCell, wrapForPage } from '../../src/explore/sql/runUserSql.ts'

describe('wrapForPage', () => {
  it('wraps the statement and asks for one extra row', () => {
    expect(wrapForPage('SELECT 1;', 100, 200)).toBe('SELECT * FROM (\nSELECT 1\n) AS q LIMIT 101 OFFSET 200')
  })
  it('drops a trailing comment and semicolons', () => {
    expect(wrapForPage('SELECT 1 ;;  -- done', 10, 0)).toContain('SELECT 1\n)')
  })
})

describe('toCell', () => {
  it('converts big integers and dates', () => {
    expect(toCell(12n)).toBe(12)
    expect(toCell(new Date('2024-03-05T00:00:00.000Z'))).toBe('2024-03-05')
    expect(toCell(new Date('2024-03-05T08:30:00.000Z'))).toBe('2024-03-05 08:30:00.000Z'.replace('.000Z', ''))
    expect(toCell(null)).toBeNull()
    expect(toCell(true)).toBe(true)
  })
})
