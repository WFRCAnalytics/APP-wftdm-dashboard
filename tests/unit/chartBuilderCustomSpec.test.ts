import { describe, expect, it } from 'vitest'
import { normalizeCustomSpec } from '../../src/charts/builder/customSpec.ts'
import { fromConfig } from '../../src/charts/builder/spec.ts'

const base = { data: { table: 'trip_mode_share' }, mark: 'bar', encoding: { x: { field: 'mode' }, y: { field: 'trips', aggregate: 'sum' } } }

describe('normalizeCustomSpec', () => {
  it('turns a short YAML spec into a configuration over the compared runs', () => {
    const r = normalizeCustomSpec(base, ['a', 'b'])
    expect(r.ok && r.table).toBe('trip_mode_share')
    expect(r.ok && r.config.data).toEqual({ relation: 't:trip_mode_share', source: { scenarios: ['a', 'b'], sql: '' } })
    expect(r.ok && r.config.mark).toBe('bar')
  })
  it('accepts a relation or a bare table key, and a donut', () => {
    expect(normalizeCustomSpec({ ...base, data: { relation: 't:x' } }, []).ok).toBe(true)
    expect(normalizeCustomSpec({ ...base, data: undefined, table: 'y' }, []).ok).toBe(true)
    const d = normalizeCustomSpec({ ...base, mark: 'pie', donut: true }, [])
    expect(d.ok && d.config.mark).toBe('pie:donut')
  })
  it('explains what is missing', () => {
    expect(!normalizeCustomSpec(null, []).ok).toBe(true)
    const noTable = normalizeCustomSpec({ ...base, data: {} }, [])
    expect(!noTable.ok && noTable.error).toContain('spec.data.table')
    const noMark = normalizeCustomSpec({ ...base, mark: undefined }, [])
    expect(!noMark.ok && noMark.error).toContain('spec.mark')
    const noEnc = normalizeCustomSpec({ ...base, encoding: undefined }, [])
    expect(!noEnc.ok && noEnc.error).toContain('spec.encoding')
  })
  it('validates against the table like an imported configuration', () => {
    const n = normalizeCustomSpec(base, ['a'])
    if (!n.ok) throw new Error(n.error)
    const ok = fromConfig(JSON.stringify(n.config), { scenarios: ['a'], columnsOf: () => [{ name: 'mode' }, { name: 'trips' }] })
    expect(ok.ok).toBe(true)
    const bad = fromConfig(JSON.stringify(n.config), { scenarios: ['a'], columnsOf: () => [{ name: 'mode' }] })
    expect(!bad.ok && bad.errors[0]).toContain('encoding.y.field: "trips" is not a column')
  })
})
