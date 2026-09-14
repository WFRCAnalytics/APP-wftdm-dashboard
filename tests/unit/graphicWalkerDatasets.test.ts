import { describe, it, expect } from 'vitest'
import { listSelectableDatasets, filterSchemaConsistent } from '../../src/panels/graphicWalkerDatasets.ts'

// 028-graphic-walker-dataset-picker — see
// specs/028-graphic-walker-dataset-picker/contracts/graphic-walker-dataset-picker.md
//
// 056-lazy-tab-scoped-loading: the input source changed from
// services/duckdb.ts's listViews() (the live, registered-so-far view
// registry) to each scenario's real metric CATALOG
// (state/appState.ts's availableMetrics, known independent of load
// state — contracts/graphic-walker-dataset-catalog.md). The intersection
// logic itself is unchanged; these cases are rewritten for the new
// Map-of-catalogs input shape. The old "never returns a zonemap-geom__
// view" case no longer applies and is removed — a scenario's own real
// catalog never contains a non-metric entry like that in the first
// place (unlike listViews(), which mixed every view family together).
describe('graphicWalkerDatasets.listSelectableDatasets', () => {
  it('returns an empty array when scenarioNames is empty', () => {
    expect(listSelectableDatasets(new Map([['observed', ['summary_kpis']]]), [])).toEqual([])
  })

  it('returns a metric present for every given scenario', () => {
    const catalog = new Map([
      ['observed', ['summary_kpis', 'vmt_by_home_taz']],
      ['good_scenario', ['summary_kpis', 'vmt_by_home_taz', 'trip_mode_share']],
    ])
    expect(listSelectableDatasets(catalog, ['observed', 'good_scenario'])).toEqual([
      'summary_kpis',
      'vmt_by_home_taz',
    ])
  })

  it('excludes a metric present for only some of the given scenarios', () => {
    const catalog = new Map([
      ['observed', ['summary_kpis']],
      ['good_scenario', ['summary_kpis', 'trip_mode_share']], // observed-only-missing — excluded
    ])
    const result = listSelectableDatasets(catalog, ['observed', 'good_scenario'])
    expect(result).not.toContain('trip_mode_share')
    expect(result).toEqual(['summary_kpis'])
  })

  it('scopes to a single pinned scenario when only one name is given', () => {
    const catalog = new Map([
      ['good_scenario', ['trip_mode_share', 'screenlines']],
      ['observed', ['summary_kpis']], // a different scenario entirely — irrelevant here
    ])
    expect(listSelectableDatasets(catalog, ['good_scenario'])).toEqual(['screenlines', 'trip_mode_share'])
  })

  it('sorts results alphabetically regardless of input ordering', () => {
    const catalog = new Map([['a', ['zeta', 'alpha', 'mu']]])
    expect(listSelectableDatasets(catalog, ['a'])).toEqual(['alpha', 'mu', 'zeta'])
  })

  it('returns an empty array when the requested scenario has no catalog entry at all', () => {
    expect(
      listSelectableDatasets(new Map([['observed', ['summary_kpis']]]), ['nonexistent_scenario_zzz']),
    ).toEqual([])
  })
})

// A real, confirmed gap found during this feature's implementation:
// listSelectableDatasets() alone can't detect a metric whose real columns
// differ across scenarios (view existence != schema compatibility) — see
// filterSchemaConsistent()'s own doc comment for the full, confirmed
// finding (tests/fixtures/generate.py's own vmt_by_home_taz is a real
// example: 2 columns under observed, 3 under good_scenario).
describe('graphicWalkerDatasets.filterSchemaConsistent', () => {
  it('returns every candidate unchanged when scenarioNames has 0 or 1 entries (no union is ever built)', () => {
    const columnsByScenario = new Map([['good_scenario', new Map([['vmt_by_home_taz', 'taz_id,purpose,vmt_per_capita']])]])
    expect(filterSchemaConsistent(['vmt_by_home_taz'], [], columnsByScenario)).toEqual(['vmt_by_home_taz'])
    expect(filterSchemaConsistent(['vmt_by_home_taz'], ['good_scenario'], columnsByScenario)).toEqual([
      'vmt_by_home_taz',
    ])
  })

  it('keeps a candidate whose column signature matches across every scenario', () => {
    const columnsByScenario = new Map([
      ['observed', new Map([['summary_kpis', 'avg_trip_distance,purpose_count,total_households,total_persons,total_trips']])],
      ['good_scenario', new Map([['summary_kpis', 'avg_trip_distance,purpose_count,total_households,total_persons,total_trips']])],
    ])
    expect(filterSchemaConsistent(['summary_kpis'], ['observed', 'good_scenario'], columnsByScenario)).toEqual([
      'summary_kpis',
    ])
  })

  it('excludes a candidate whose column signature differs between scenarios (the real vmt_by_home_taz case)', () => {
    const columnsByScenario = new Map([
      ['observed', new Map([['vmt_by_home_taz', 'taz_id,vmt_per_capita']])],
      ['good_scenario', new Map([['vmt_by_home_taz', 'purpose,taz_id,vmt_per_capita']])],
    ])
    expect(filterSchemaConsistent(['vmt_by_home_taz'], ['observed', 'good_scenario'], columnsByScenario)).toEqual([])
  })

  it('excludes a candidate missing from the columns map entirely for some scenario', () => {
    const columnsByScenario = new Map([
      ['observed', new Map([['summary_kpis', 'a,b']])],
      ['good_scenario', new Map<string, string>()],
    ])
    expect(filterSchemaConsistent(['summary_kpis'], ['observed', 'good_scenario'], columnsByScenario)).toEqual([])
  })
})
