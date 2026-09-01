import { describe, expect, it } from 'vitest'

import { buildPanelQuery, resolveActiveScenarios, extractGlobalFilterIds } from '@/panels/panelQuery'
import type { ValueBoxPanelConfig, PlotlyPanelConfig, ObservablePlotPanelConfig } from '@/layout/types'

const valueBoxConfig: ValueBoxPanelConfig = {
  type: 'valuebox',
  title: 'Total Trips',
  metric: 'summary_kpis',
  column: 'total_trips',
  format: '{:,.0f}',
}

const plotlyConfig: PlotlyPanelConfig = {
  type: 'plotly',
  title: 'Mode Share by Purpose',
  metric: 'trip_mode_share',
  filter: '$filters.purpose',
  traces: [{ type: 'bar', x: '$metric.purpose', y: '$metric.share' }],
}

describe('buildPanelQuery', () => {
  it('emits a bare $scenario.<metric> reference with no WHERE clause when filter is unset', () => {
    const sql = buildPanelQuery(valueBoxConfig, {})
    expect(sql).toBe('SELECT "total_trips" FROM ($scenario.summary_kpis)')
  })

  it('selects a single column for a valuebox panel', () => {
    const sql = buildPanelQuery(valueBoxConfig, {})
    expect(sql).toContain('SELECT "total_trips"')
  })

  it('selects * for a non-valuebox panel', () => {
    const sql = buildPanelQuery({ ...plotlyConfig, filter: undefined }, {})
    expect(sql).toContain('SELECT *')
  })

  it('places $filters.x alone on its own line, per the all-sentinel line-omission rule', () => {
    const sql = buildPanelQuery(plotlyConfig, {})
    const lines = sql.split('\n')
    const filterLine = lines.find((l) => l.includes('$filters.purpose'))
    expect(filterLine).toBeDefined()
    expect(filterLine!.trim()).toBe(`AND "purpose" = '$filters.purpose'`)
  })

  it('bypasses the $scenario.x union entirely when scenario (singular) is set', () => {
    const sql = buildPanelQuery({ ...valueBoxConfig, scenario: 'good_scenario' }, {})
    expect(sql).toBe('SELECT "total_trips" FROM "good_scenario__summary_kpis"')
    expect(sql).not.toContain('$scenario')
  })

  it('does not include a WHERE clause when config.filter is not a $filters.x reference', () => {
    const sql = buildPanelQuery({ ...valueBoxConfig, filter: 'literal-not-a-placeholder' }, {})
    expect(sql).not.toContain('WHERE')
  })

  // 007-observable-plot-panel, research.md §1: filter: also accepts an
  // inline Record<string,string> map — one column-name key per entry,
  // independent of that entry's own placeholder id.
  it('emits one AND line per entry when config.filter is a Record<string,string> map', () => {
    const sql = buildPanelQuery(
      { ...plotlyConfig, filter: { purpose: '$filters.purpose', mode: '$inputs.mode_select' } },
      {},
    )
    const lines = sql.split('\n').map((l) => l.trim())
    expect(lines).toContain(`AND "purpose" = '$filters.purpose'`)
    expect(lines).toContain(`AND "mode" = '$inputs.mode_select'`)
  })

  it('binds a map entry\'s column name independently of its placeholder id', () => {
    const sql = buildPanelQuery(
      { ...plotlyConfig, filter: { income_category: '$inputs.income_filter' } },
      {},
    )
    expect(sql).toContain(`AND "income_category" = '$inputs.income_filter'`)
  })

  it('emits no WHERE clause for an empty filter map', () => {
    const sql = buildPanelQuery({ ...plotlyConfig, filter: {} }, {})
    expect(sql).not.toContain('WHERE')
  })

  // 007-observable-plot-panel: a multiselect-type $inputs.<id> reference
  // gets an IN (...) shape — "any of the selected values" cannot be a
  // single-value equality comparison.
  const observablePlotConfig: ObservablePlotPanelConfig = {
    type: 'observable-plot',
    title: 'Mode Share by Purpose',
    metric: 'trip_mode_share',
    mark: 'barY',
  }

  it('emits an IN (...) shape (no surrounding quotes) for a multiselect-type $inputs.<id> reference', () => {
    const config: ObservablePlotPanelConfig = {
      ...observablePlotConfig,
      filter: { mode: '$inputs.mode_select' },
      inputs: [{ id: 'mode_select', label: 'Mode', type: 'multiselect', column: 'mode', default: 'SOV' }],
    }
    const sql = buildPanelQuery(config, {})
    expect(sql).toContain(`AND "mode" IN ($inputs.mode_select)`)
    expect(sql).not.toContain(`AND "mode" = '$inputs.mode_select'`)
  })

  it('keeps the ordinary = shape for a select-type $inputs.<id> reference, even when config.inputs is present', () => {
    const config: ObservablePlotPanelConfig = {
      ...observablePlotConfig,
      filter: { mode: '$inputs.mode_select' },
      inputs: [{ id: 'mode_select', label: 'Mode', type: 'select', column: 'mode', default: 'SOV' }],
    }
    const sql = buildPanelQuery(config, {})
    expect(sql).toContain(`AND "mode" = '$inputs.mode_select'`)
  })

  it('keeps the ordinary = shape for $filters.<id>, even when config.inputs declares a same-named multiselect id', () => {
    const config: ObservablePlotPanelConfig = {
      ...observablePlotConfig,
      filter: { purpose: '$filters.purpose' },
      inputs: [{ id: 'purpose', label: 'Purpose', type: 'multiselect', column: 'purpose', default: 'HBW' }],
    }
    const sql = buildPanelQuery(config, {})
    expect(sql).toContain(`AND "purpose" = '$filters.purpose'`)
  })
})

describe('extractGlobalFilterIds', () => {
  it('returns [] for undefined', () => {
    expect(extractGlobalFilterIds(undefined)).toEqual([])
  })

  it('extracts the single id from a bare $filters.x string', () => {
    expect(extractGlobalFilterIds('$filters.purpose')).toEqual(['purpose'])
  })

  it('returns [] for a non-placeholder literal string', () => {
    expect(extractGlobalFilterIds('literal-not-a-placeholder')).toEqual([])
  })

  it('extracts every $filters.<id> from a map with only $filters. entries', () => {
    expect(
      extractGlobalFilterIds({ purpose: '$filters.purpose', mode: '$filters.mode' }),
    ).toEqual(['purpose', 'mode'])
  })

  it('excludes $inputs.<id> entries from a mixed map — only $filters. ids are returned', () => {
    expect(
      extractGlobalFilterIds({ purpose: '$filters.purpose', mode: '$inputs.mode_select' }),
    ).toEqual(['purpose'])
  })

  it('returns [] for a map with only $inputs. entries', () => {
    expect(extractGlobalFilterIds({ mode: '$inputs.mode_select' })).toEqual([])
  })
})

describe('resolveActiveScenarios', () => {
  it('returns globallyActive unchanged when neither scenario nor scenarios is set', () => {
    expect(resolveActiveScenarios(valueBoxConfig, ['observed', 'good_scenario'])).toEqual([
      'observed',
      'good_scenario',
    ])
  })

  it('returns config.scenarios verbatim, ignoring globallyActive, when set', () => {
    const config = { ...valueBoxConfig, scenarios: ['good_scenario'] }
    expect(resolveActiveScenarios(config, ['observed', 'good_scenario'])).toEqual([
      'good_scenario',
    ])
  })

  it('scenario (singular) short-circuits the union in buildPanelQuery — resolveActiveScenarios output is unused in that case', () => {
    // resolveActiveScenarios itself still honors scenarios if both are set
    // (a config-authoring edge case); buildPanelQuery is what actually
    // ignores this output once `scenario` bypasses the placeholder.
    const config = { ...valueBoxConfig, scenario: 'good_scenario', scenarios: ['observed'] }
    const sql = buildPanelQuery(config, {})
    expect(sql).not.toContain('$scenario')
    expect(sql).toContain('"good_scenario__summary_kpis"')
  })
})
