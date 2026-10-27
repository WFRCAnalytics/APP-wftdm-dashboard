import { describe, expect, it } from 'vitest'
import { autoKeys, buildSql, emptyModel, planQuery, suggestJoins, type PlanInput, type TableInfo } from '../../src/explore/sql/queryModel.ts'

const T = (name: string, columns: [string, TableInfo['columns'][number]['type']][]): TableInfo => ({ name, columns: columns.map(([n, t]) => ({ name: n, type: t })) })
const tables = {
  households: T('households', [['hh_id', 'id'], ['zone', 'id'], ['income', 'integer']]),
  vehicles: T('vehicles', [['veh_id', 'id'], ['hh_id', 'id'], ['zone', 'id'], ['fuel_type', 'category'], ['annual_mi', 'integer']]),
  trips: T('trips', [['mode', 'category'], ['trips', 'integer']]),
}
const input = (scenarios: string[], table = 'households'): PlanInput => ({ table, scenarios, tables, viewName: (s, t) => `${s}__${t}` })
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('buildSql', () => {
  it('reads one scenario straight from its view', () => {
    const i = input(['base'])
    expect(norm(buildSql(planQuery(i, emptyModel()), emptyModel()))).toBe('SELECT * FROM "base__households"')
  })
  it('unions several scenarios and adds a scenario column', () => {
    const i = input(['base', 'rail'], 'trips')
    const sql = buildSql(planQuery(i, emptyModel()), emptyModel())
    expect(sql).toContain(`SELECT 'base' AS scenario, * FROM "base__trips"`)
    expect(sql).toContain('UNION ALL')
    expect(sql).toContain(') AS t')
  })
  it('filters, sorts and limits', () => {
    const i = input(['base'])
    const m = { ...emptyModel(), where: [{ col: 'income', op: '>' as const, val: '50000' }], order: 'income', limit: '10' }
    const sql = norm(buildSql(planQuery(i, m), m))
    expect(sql).toBe('SELECT * FROM "base__households" WHERE income > 50000 ORDER BY income DESC LIMIT 10')
  })
  it('quotes text values and escapes quotes', () => {
    const i = input(['base'], 'trips')
    const m = { ...emptyModel(), where: [{ col: 'mode', op: '=' as const, val: "it's" }] }
    expect(buildSql(planQuery(i, m), m)).toContain(`mode = 'it''s'`)
  })
  it('groups with a measure', () => {
    const i = input(['base'], 'trips')
    const m = { ...emptyModel(), group: ['mode'], fn: 'sum' as const, aggCol: 'trips', order: 'sum_trips' }
    expect(norm(buildSql(planQuery(i, m), m))).toBe('SELECT mode, SUM(trips) AS sum_trips FROM "base__trips" GROUP BY mode ORDER BY sum_trips DESC')
  })
  it('falls back to a count when there is no number to total', () => {
    const i = input(['base'], 'vehicles')
    const m = { ...emptyModel(), group: ['fuel_type'] }
    const p = planQuery({ ...i, tables: { vehicles: T('vehicles', [['fuel_type', 'category']]) } }, m)
    expect(norm(buildSql(p, m))).toContain('COUNT(*) AS n')
  })
})

describe('joins', () => {
  const m = { ...emptyModel(), joins: [{ table: 'vehicles', type: 'left' as const, keys: [{ l: 'hh_id', r: 'hh_id' }] }] }
  it('drops the duplicate key and renames clashing columns', () => {
    const p = planQuery(input(['base']), m)
    const names = p.cols.map((c) => c.name)
    expect(names).toEqual(['hh_id', 'zone', 'income', 'veh_id', 'vehicles_zone', 'fuel_type', 'annual_mi'])
  })
  it('writes the join and aliases the renamed column', () => {
    const p = planQuery(input(['base']), m)
    const sql = buildSql(p, m)
    expect(sql).toContain('LEFT JOIN "base__vehicles" AS b')
    expect(sql).toContain('ON a.hh_id = b.hh_id')
    expect(sql).toContain('b.zone AS vehicles_zone')
  })
  it('joins on the scenario column too when both sides are unioned', () => {
    const i = input(['base', 'rail'])
    expect(autoKeys(i, 'vehicles', ['scenario', 'hh_id', 'zone', 'income']).map((k) => k.l)).toEqual(['hh_id', 'zone', 'scenario'])
  })
  it('supports every join type', () => {
    for (const [type, word] of [['inner', 'INNER JOIN'], ['right', 'RIGHT JOIN'], ['full', 'FULL OUTER JOIN']] as const) {
      const mm = { ...m, joins: [{ ...m.joins[0], type }] }
      expect(buildSql(planQuery(input(['base']), mm), mm)).toContain(word)
    }
  })
  it('ignores a join without a usable key and never more than four', () => {
    const bad = { ...emptyModel(), joins: [{ table: 'vehicles', type: 'inner' as const, keys: [{ l: 'nope', r: 'hh_id' }] }] }
    const p = planQuery(input(['base']), bad)
    expect(p.joins[0].ok).toBe(false)
    expect(p.needAlias).toBe(false)
  })
  it('suggests tables that share a column', () => {
    const i = input(['base'])
    const s = suggestJoins(i, planQuery(i, emptyModel()), emptyModel())
    expect(s.map((x) => x.table)).toEqual(['vehicles'])
  })
  it('builds row-count queries per stage', () => {
    const p = planQuery(input(['base']), m)
    expect(norm(buildSql(p, m, 'source'))).toBe('SELECT count(*) AS n FROM "base__households" AS a')
    expect(norm(buildSql(p, m, { joins: 1 }))).toContain('LEFT JOIN')
  })
})
