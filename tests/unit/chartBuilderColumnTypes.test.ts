import { describe, expect, it } from 'vitest'
import { chartRole, inferDataType, roleAccepts, typesPresent } from '../../src/charts/builder/columnTypes.ts'

describe('inferDataType', () => {
  it('maps DuckDB numeric types', () => {
    expect(inferDataType({ name: 'trips', dbType: 'BIGINT' })).toBe('integer')
    expect(inferDataType({ name: 'share', dbType: 'DECIMAL(18,3)' })).toBe('decimal')
    expect(inferDataType({ name: 'share', dbType: 'DOUBLE' })).toBe('decimal')
  })
  it('treats id-like integers as ID', () => {
    expect(inferDataType({ name: 'hh_id', dbType: 'INTEGER' })).toBe('id')
    expect(inferDataType({ name: 'taz', dbType: 'INTEGER' })).toBe('id')
    expect(inferDataType({ name: 'hours', dbType: 'INTEGER' })).toBe('integer')
  })
  it('maps booleans, dates and times', () => {
    expect(inferDataType({ name: 'owns_home', dbType: 'BOOLEAN' })).toBe('boolean')
    expect(inferDataType({ name: 'd', dbType: 'DATE' })).toBe('date')
    expect(inferDataType({ name: 't', dbType: 'TIMESTAMP WITH TIME ZONE' })).toBe('datetime')
  })
  it('splits strings into category, text and ID', () => {
    expect(inferDataType({ name: 'mode', dbType: 'VARCHAR', rows: 5000, distinct: 6, avgLength: 8 })).toBe('category')
    expect(inferDataType({ name: 'notes', dbType: 'VARCHAR', rows: 500, distinct: 90, avgLength: 70 })).toBe('text')
    expect(inferDataType({ name: 'hh_id', dbType: 'VARCHAR', rows: 800, distinct: 800, avgLength: 6 })).toBe('id')
    expect(inferDataType({ name: 'code', dbType: 'VARCHAR', rows: 200, distinct: 199, avgLength: 8 })).toBe('id')
    expect(inferDataType({ name: 'comment', dbType: 'VARCHAR', rows: 200, distinct: 199, avgLength: 30 })).toBe('text')
  })
  it('detects geometry and nested types', () => {
    expect(inferDataType({ name: 'geometry', dbType: 'GEOMETRY' })).toBe('geometry')
    expect(inferDataType({ name: 'geom', dbType: 'BLOB' })).toBe('geometry')
    expect(inferDataType({ name: 'payload', dbType: 'BLOB' })).toBe('complex')
    expect(inferDataType({ name: 'xs', dbType: 'INTEGER[]' })).toBe('complex')
    expect(inferDataType({ name: 's', dbType: 'STRUCT(a INTEGER)' })).toBe('complex')
  })
})

describe('roles', () => {
  it('maps each type to a chart role', () => {
    expect(chartRole('category')).toBe('n')
    expect(chartRole('boolean')).toBe('n')
    expect(chartRole('ordinal')).toBe('o')
    expect(chartRole('decimal')).toBe('q')
    expect(chartRole('datetime')).toBe('t')
    expect(chartRole('text')).toBe('')
    expect(chartRole('id')).toBe('')
    expect(chartRole('geometry')).toBe('')
  })
  it('never accepts an empty role', () => {
    expect(roleAccepts('not', '')).toBe(false)
    expect(roleAccepts('q', 'q')).toBe(true)
    expect(roleAccepts('no', 't')).toBe(false)
  })
  it('lists only the types present, in display order, with counts', () => {
    const t = typesPresent([{ type: 'integer' }, { type: 'category' }, { type: 'integer' }, { type: 'text' }])
    expect(t).toEqual([{ type: 'category', count: 1 }, { type: 'integer', count: 2 }, { type: 'text', count: 1 }])
  })
})
