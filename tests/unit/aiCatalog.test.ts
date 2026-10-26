// 064-ai-chat-assistant: catalogue naming and lookup (pure parts; appState/duckdb wrappers are covered by Playwright).
import { describe, expect, it } from 'vitest'
import { buildCatalogFrom, catalogText, resolveViews, viewsReferencedBy } from '@/services/ai/catalog'

const SCENARIOS = [
  { name: 'base', status: 'ready' as const, active: true, availableMetrics: ['trip_mode_share', 'zones'], displayName: 'Base 2023', kind: 'scenario' as const, year: 2023 },
  { name: 'alt', status: 'ready' as const, active: false, availableMetrics: ['trip_mode_share'], label: 'Alt A', kind: 'scenario' as const },
  { name: 'old', status: 'ready' as const, active: true, availableMetrics: ['x'], kind: 'hidden' as const },
  { name: 'bad', status: 'failed' as const, active: true, availableMetrics: ['x'] },
  { name: 'new', status: 'registering' as const, active: true },
]

const catalog = buildCatalogFrom(SCENARIOS, 'base', (v) => v === 'base__zones')

describe('buildCatalogFrom', () => {
  it('keeps ready, non-hidden scenarios only, active or not', () => {
    expect(catalog.map((s) => s.name)).toEqual(['base', 'alt'])
    expect(catalog[1].active).toBe(false)
  })

  it('names views {scenario}__{metric} and flags loaded ones', () => {
    expect(catalog[0].metrics).toEqual([
      { metric: 'trip_mode_share', view: 'base__trip_mode_share', loaded: false },
      { metric: 'zones', view: 'base__zones', loaded: true },
    ])
  })

  it('labels: viewer label, then manifest display name, then name; marks the baseline', () => {
    expect(catalog[0].label).toBe('Base 2023')
    expect(catalog[1].label).toBe('Alt A')
    expect(catalog[0].baseline).toBe(true)
  })
})

describe('catalogText', () => {
  it('lists every scenario with its metric names, never any data', () => {
    const t = catalogText(catalog)
    expect(t).toContain('"base__<metric>"')
    expect(t).toContain('trip_mode_share, zones')
    expect(t).toContain('not active')
  })
  it('says so when nothing is loaded', () => expect(catalogText([])).toMatch(/no scenarios/))
})

describe('resolveViews', () => {
  it('maps quoted, differently-cased names to pairs and reports unknown ones', () => {
    const r = resolveViews(['"base__zones"', 'ALT__trip_mode_share', 'nope__x'], catalog)
    expect(r.pairs.map((p) => `${p.scenario}/${p.metric}`)).toEqual(['base/zones', 'alt/trip_mode_share'])
    expect(r.notFound).toEqual(['nope__x'])
  })
})

describe('viewsReferencedBy', () => {
  it('finds catalogue views mentioned in SQL', () => {
    const sql = 'SELECT * FROM "base__trip_mode_share" a JOIN alt__trip_mode_share b USING (mode)'
    expect(viewsReferencedBy(sql, catalog).map((v) => v.view)).toEqual(['base__trip_mode_share', 'alt__trip_mode_share'])
  })
})
