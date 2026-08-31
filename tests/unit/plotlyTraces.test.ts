import { describe, expect, it } from 'vitest'

import { resolveColumnName, resolveTraces } from '@/panels/plotlyTraces'
import type { PlotlyTraceConfig } from '@/layout/types'

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
