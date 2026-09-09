import { describe, expect, it } from 'vitest'

import { resolveScenarioColor, resolveScenarioLabel, type ScenarioDisplayMap } from '@/panels/scenarioDisplay'

// 035-scenario-label-color — pure resolver coverage, no React/appState
// involved (matches this module's own dependency-free contract).

function buildMap(entries: [string, { label?: string; color?: string }][]): ScenarioDisplayMap {
  return new Map(entries)
}

describe('resolveScenarioLabel', () => {
  it('resolves to the custom label when one is set', () => {
    const map = buildMap([['good_scenario', { label: 'Preferred Alternative' }]])
    expect(resolveScenarioLabel('good_scenario', map)).toBe('Preferred Alternative')
  })

  it('falls back to the real name when no label is set', () => {
    const map = buildMap([['good_scenario', { color: '#4e79a7' }]])
    expect(resolveScenarioLabel('good_scenario', map)).toBe('good_scenario')
  })

  it('falls back to the real name when the name is absent from the map entirely', () => {
    const map = buildMap([])
    expect(resolveScenarioLabel('unregistered_scenario', map)).toBe('unregistered_scenario')
  })
})

describe('resolveScenarioColor', () => {
  it('resolves to the effective color when one is set', () => {
    const map = buildMap([['good_scenario', { color: '#4e79a7' }]])
    expect(resolveScenarioColor('good_scenario', map)).toBe('#4e79a7')
  })

  it('returns undefined when no color is resolved — never invents one', () => {
    const map = buildMap([['good_scenario', { label: 'Preferred Alternative' }]])
    expect(resolveScenarioColor('good_scenario', map)).toBeUndefined()
  })

  it('returns undefined when the name is absent from the map entirely', () => {
    const map = buildMap([])
    expect(resolveScenarioColor('unregistered_scenario', map)).toBeUndefined()
  })
})
