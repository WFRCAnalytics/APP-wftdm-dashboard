import { describe, expect, it } from 'vitest'

import { buildPanelQuery, resolveActiveScenarios } from '@/panels/panelQuery'
import type { ValueBoxPanelConfig, PlotlyPanelConfig } from '@/layout/types'

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
