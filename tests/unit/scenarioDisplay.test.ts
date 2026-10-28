import Color from 'color'
import { afterEach, describe, expect, it } from 'vitest'

import {
  adaptScenarioColor,
  resolveDefaultScenarioColor,
  resolveScenarioColor,
  resolveScenarioLabel,
  scenarioPalette15,
  scenarioPaletteSafe15,
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
    const map = buildMap([['good_scenario', { label: 'Preferred ScenarioGroup' }]])
    expect(resolveScenarioLabel('good_scenario', map)).toBe('Preferred ScenarioGroup')
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
    const map = buildMap([['good_scenario', { label: 'Preferred ScenarioGroup' }]])
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

  it('falls back to the shipped 15-color default (stable by index, wrapping at 15)', () => {
    expect(resolveDefaultScenarioColor(0)).toBe(adaptScenarioColor(scenarioPalette15[0], false))
    expect(resolveDefaultScenarioColor(14)).toBe(adaptScenarioColor(scenarioPalette15[14], false))
    expect(resolveDefaultScenarioColor(15)).toBe(resolveDefaultScenarioColor(0)) // wraps
  })

  it('an empty configured palette also falls back to the shipped default, not a crash', () => {
    setDeployerScenarioPalette([])
    expect(resolveDefaultScenarioColor(1)).toBe(adaptScenarioColor(scenarioPalette15[1], false))
  })

  it('clearing back to undefined restores the shipped default', () => {
    setDeployerScenarioPalette(['#111111'])
    expect(resolveDefaultScenarioColor(0)).toBe('#111111')
    setDeployerScenarioPalette(undefined)
    expect(resolveDefaultScenarioColor(0)).toBe(adaptScenarioColor(scenarioPalette15[0], false))
  })

  it('with colorblindSafe true and no deployer palette configured, cycles the Okabe-Ito based safe 15', () => {
    expect(resolveDefaultScenarioColor(1, true)).toBe(adaptScenarioColor(scenarioPaletteSafe15[1], false))
    expect(resolveDefaultScenarioColor(15, true)).toBe(resolveDefaultScenarioColor(0, true)) // wraps
  })

  it('adaptScenarioColor clamps HCL lightness: dark L >= 62, light L <= 60, and leaves in-range colors alone', () => {
    const lightOf = (hex: string) => Color(hex).lch().array()[0]
    expect(lightOf(adaptScenarioColor('#004b7a', true))).toBeGreaterThanOrEqual(61.5)
    expect(lightOf(adaptScenarioColor('#f0e442', false))).toBeLessThanOrEqual(60.5)
    expect(adaptScenarioColor('#4c8bf5', false)).toBe('#4c8bf5')
  })

  it('a deployer-configured palette always wins, regardless of colorblindSafe — an explicit deployer choice is never overridden', () => {
    setDeployerScenarioPalette(['#111111', '#222222'])
    expect(resolveDefaultScenarioColor(0, true)).toBe('#111111')
    expect(resolveDefaultScenarioColor(1, true)).toBe('#222222')
  })
})
