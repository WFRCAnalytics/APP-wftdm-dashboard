import { afterEach, describe, expect, it } from 'vitest'

import {
  resolveDefaultScenarioColor,
  resolveScenarioColor,
  resolveScenarioLabel,
  setDeployerScenarioPalette,
  type ScenarioDisplayMap,
} from '@/panels/scenarioDisplay'

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

// 036-scenario-color-picker (Part A)
describe('resolveDefaultScenarioColor', () => {
  afterEach(() => {
    // Module-level state — reset after every test so no test leaks a
    // configured palette into the next one.
    setDeployerScenarioPalette(undefined)
  })

  it('cycles a deployer-configured palette by index', () => {
    setDeployerScenarioPalette(['#111111', '#222222'])
    expect(resolveDefaultScenarioColor(0)).toBe('#111111')
    expect(resolveDefaultScenarioColor(1)).toBe('#222222')
  })

  it('wraps around when index >= palette.length', () => {
    setDeployerScenarioPalette(['#111111', '#222222'])
    expect(resolveDefaultScenarioColor(2)).toBe('#111111')
    expect(resolveDefaultScenarioColor(3)).toBe('#222222')
  })

  it('falls back to the shipped --chart-1..5 default when no palette is configured', () => {
    expect(resolveDefaultScenarioColor(0)).toBe('var(--chart-1)')
    expect(resolveDefaultScenarioColor(4)).toBe('var(--chart-5)')
    expect(resolveDefaultScenarioColor(5)).toBe('var(--chart-1)') // wraps
  })

  it('an empty configured palette also falls back to the shipped default, not a crash', () => {
    setDeployerScenarioPalette([])
    expect(resolveDefaultScenarioColor(0)).toBe('var(--chart-1)')
  })

  it('clearing back to undefined restores the shipped default', () => {
    setDeployerScenarioPalette(['#111111'])
    expect(resolveDefaultScenarioColor(0)).toBe('#111111')
    setDeployerScenarioPalette(undefined)
    expect(resolveDefaultScenarioColor(0)).toBe('var(--chart-1)')
  })
})
