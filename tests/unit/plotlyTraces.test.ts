import { describe, expect, it } from 'vitest'

import { resolveColumnName, resolveTraces } from '@/panels/plotlyTraces'
import type { PlotlyTraceConfig } from '@/layout/types'
import type { ScenarioDisplayMap } from '@/panels/scenarioDisplay'

describe('resolveColumnName', () => {
  it('resolves $metric.<column> to the column name', () => {
    expect(resolveColumnName('$metric.purpose')).toBe('purpose')
  })

  it('resolves the bare $scenario sentinel to "scenario"', () => {
    expect(resolveColumnName('$scenario')).toBe('scenario')
  })

  it('returns undefined for a literal (non-placeholder) value', () => {
    expect(resolveColumnName('My Series')).toBeUndefined()
  })

  it('returns undefined for an unset field', () => {
    expect(resolveColumnName(undefined)).toBeUndefined()
  })
})

describe('resolveTraces', () => {
  // Two active scenarios unioned by buildPanelQuery's $scenario.<metric> —
  // the actual scenario-comparison use case that mechanism exists for.
  const multiScenarioRows = [
    { purpose: 'HBW', share: 0.62, scenario: 'observed' },
    { purpose: 'HBW', share: 0.58, scenario: 'good_scenario' },
  ]

  it('splits by scenario when name is the bare $scenario sentinel and color is unset — one trace per scenario, correct legend names, not one trace with an array name', () => {
    const trace: PlotlyTraceConfig = {
      type: 'bar',
      x: '$metric.purpose',
      y: '$metric.share',
      name: '$scenario',
    }
    const result = resolveTraces(trace, multiScenarioRows)

    expect(result).toHaveLength(2)
    const names = result.map((t) => t.name).sort()
    expect(names).toEqual(['good_scenario', 'observed'])
    // Every name is a plain string — never an array (the bug this test guards against).
    for (const t of result) {
      expect(typeof t.name).toBe('string')
    }

    const observedTrace = result.find((t) => t.name === 'observed')
    expect(observedTrace?.x).toEqual(['HBW'])
    expect(observedTrace?.y).toEqual([0.62])
    const goodTrace = result.find((t) => t.name === 'good_scenario')
    expect(goodTrace?.x).toEqual(['HBW'])
    expect(goodTrace?.y).toEqual([0.58])
  })

  it('color still wins over name when both resolve to columns', () => {
    const rows = [
      { mode: 'SOV', share: 0.62, scenario: 'observed' },
      { mode: 'HOV', share: 0.18, scenario: 'observed' },
    ]
    const trace: PlotlyTraceConfig = {
      type: 'bar',
      x: '$metric.mode',
      y: '$metric.share',
      color: '$metric.mode',
      name: '$scenario', // present, but color takes priority
    }
    const result = resolveTraces(trace, rows)
    expect(result).toHaveLength(2) // split by mode (2 distinct), not scenario (1 distinct)
    expect(result.map((t) => t.name).sort()).toEqual(['HOV', 'SOV'])
  })

  it('resolves text consistently in the split branch, same as x/y', () => {
    const rows = [
      { purpose: 'HBW', share: 0.62, scenario: 'observed', label: 'Observed value' },
      { purpose: 'HBW', share: 0.58, scenario: 'good_scenario', label: 'Modeled value' },
    ]
    const trace: PlotlyTraceConfig = {
      type: 'bar',
      x: '$metric.purpose',
      y: '$metric.share',
      name: '$scenario',
      text: '$metric.label',
    }
    const result = resolveTraces(trace, rows)
    const observedTrace = result.find((t) => t.name === 'observed')
    expect(observedTrace?.text).toEqual(['Observed value'])
    const goodTrace = result.find((t) => t.name === 'good_scenario')
    expect(goodTrace?.text).toEqual(['Modeled value'])
  })

  it('does not split when neither color nor name resolves to a column (single scenario, literal name)', () => {
    const rows = [{ purpose: 'HBW', share: 0.62, scenario: 'observed' }]
    const trace: PlotlyTraceConfig = {
      type: 'bar',
      x: '$metric.purpose',
      y: '$metric.share',
      name: 'Mode Share',
    }
    const result = resolveTraces(trace, rows)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Mode Share')
    expect(result[0].x).toEqual(['HBW'])
  })
})

// 035-scenario-label-color
describe('resolveTraces — scenario label/color resolution (Part A/Part B)', () => {
  const multiScenarioRows = [
    { purpose: 'HBW', share: 0.62, scenario: 'observed' },
    { purpose: 'HBW', share: 0.58, scenario: 'good_scenario' },
  ]
  const trace: PlotlyTraceConfig = {
    type: 'bar',
    x: '$metric.purpose',
    y: '$metric.share',
    name: '$scenario',
  }

  it('a labeled scenario\'s trace name resolves to the label, not the real name', () => {
    const display: ScenarioDisplayMap = new Map([['good_scenario', { label: 'Preferred Alternative' }]])
    const result = resolveTraces(trace, multiScenarioRows, display)
    const names = result.map((t) => t.name).sort()
    expect(names).toEqual(['Preferred Alternative', 'observed'])
    // Filtering/grouping still used the real name — the labeled trace's
    // own x/y data is correctly this row's, not lost or duplicated.
    const labeled = result.find((t) => t.name === 'Preferred Alternative')
    expect(labeled?.y).toEqual([0.58])
  })

  it('an unlabeled scenario\'s trace name is unchanged', () => {
    const display: ScenarioDisplayMap = new Map([['good_scenario', { label: 'Preferred Alternative' }]])
    const result = resolveTraces(trace, multiScenarioRows, display)
    expect(result.find((t) => t.name === 'observed')).toBeDefined()
  })

  it('no 3rd argument at all behaves identically to today (backward-compat)', () => {
    const result = resolveTraces(trace, multiScenarioRows)
    expect(result.map((t) => t.name).sort()).toEqual(['good_scenario', 'observed'])
    expect(result.every((t) => t.marker === undefined)).toBe(true)
  })

  it('a split on a non-scenario column is unaffected by a populated scenarioDisplay map', () => {
    const rows = [
      { mode: 'SOV', share: 0.62, scenario: 'observed' },
      { mode: 'HOV', share: 0.18, scenario: 'observed' },
    ]
    const modeTrace: PlotlyTraceConfig = {
      type: 'bar',
      x: '$metric.mode',
      y: '$metric.share',
      color: '$metric.mode',
    }
    const display: ScenarioDisplayMap = new Map([['observed', { label: 'Should Not Apply', color: '#ff0000' }]])
    const result = resolveTraces(modeTrace, rows, display)
    expect(result.map((t) => t.name).sort()).toEqual(['HOV', 'SOV'])
    expect(result.every((t) => t.marker === undefined)).toBe(true)
  })

  it('a scenario with a resolved color sets marker.color', () => {
    const display: ScenarioDisplayMap = new Map([['good_scenario', { color: '#4e79a7' }]])
    const result = resolveTraces(trace, multiScenarioRows, display)
    const goodTrace = result.find((t) => t.name === 'good_scenario')
    expect(goodTrace?.marker).toEqual({ color: '#4e79a7' })
  })

  it('a scenario with no resolved color leaves marker.color unset — key absent, not undefined', () => {
    const display: ScenarioDisplayMap = new Map([['good_scenario', { label: 'Preferred Alternative' }]])
    const result = resolveTraces(trace, multiScenarioRows, display)
    const observedTrace = result.find((t) => t.name === 'observed')
    expect(observedTrace).toBeDefined()
    expect('marker' in observedTrace!).toBe(false)
  })
})
