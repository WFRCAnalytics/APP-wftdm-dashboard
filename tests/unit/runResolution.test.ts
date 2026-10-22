import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as appState from '../../src/state/appState.ts'
import * as compareState from '../../src/state/compareState.ts'
import {
  bootCompareState,
  currentView,
  deriveDeployment,
  getBaselineForYear,
  isRunInYear,
} from '../../src/services/runResolution.ts'

// The store-facing half of P3: runs registered in appState, years from config or manifests, defaults at boot.

const NAMES = ['obs', 'base-2023', 'alt-2023', 'base-2036', 'alt-2036']

function reg(name: string, extra: Partial<appState.ScenarioMetadata> = {}) {
  appState.register(name, { source: 'url', path: name, ...extra })
  appState.setStatus(name, 'ready')
  appState.setActive(name, true)
}

beforeEach(() => {
  reg('obs', { pinned: true })
  reg('base-2023', { alternative: 'base', year: 2023 })
  reg('alt-2023', { alternative: 'alt', year: 2023 })
  reg('base-2036', { alternative: 'base', year: 2036 })
  reg('alt-2036', { alternative: 'alt', year: 2036 })
})

afterEach(() => {
  for (const name of NAMES) appState.unregister(name)
  compareState.initCompareState({ deployment: { years: [], baseYear: 0, defaultYear: 0 }, focus: '', compare: true, baseline: '' })
})

describe('deriveDeployment', () => {
  const runs = [
    { name: 'a', alternative: 'a', year: 2036, kind: 'scenario' as const, ready: true },
    { name: 'b', alternative: 'a', year: 2023, kind: 'scenario' as const, ready: true },
    { name: 'o', alternative: 'o', year: undefined, kind: 'observed' as const, ready: true },
  ]

  it('derives sorted years from the manifests, base year first, default year = base year', () => {
    expect(deriveDeployment(runs, {})).toEqual({ years: [{ year: 2023 }, { year: 2036 }], baseYear: 2023, defaultYear: 2023 })
  })

  it('config wins, and an unknown defaultYear falls back to the base year', () => {
    const years = [{ year: 2023, label: 'Base year' }, { year: 2036 }]
    expect(deriveDeployment(runs, { years, baseYear: 2023, defaultYear: 2036 })).toEqual({ years, baseYear: 2023, defaultYear: 2036 })
    expect(deriveDeployment(runs, { years, defaultYear: 1999 }).defaultYear).toBe(2023)
  })

  it('a deployment with no years is single-year: no years, base year 0', () => {
    expect(deriveDeployment([{ ...runs[2] }], {})).toEqual({ years: [], baseYear: 0, defaultYear: 0 })
  })
})

describe('bootCompareState and the resolved view', () => {
  it('boots with the baseline focus, the default year, and Compare on with two scenarios', () => {
    bootCompareState({})
    const s = compareState.getState()
    expect(s).toMatchObject({ compare: true, focus: 'base', year: 2023, reference: { kind: 'scenario', name: 'base' } })
    // base year: the legacy Observed run is part of the compare set; the 2023 runs show
    expect(currentView().active).toEqual(['obs', 'base-2023', 'alt-2023'])
  })

  it('switching the year re-resolves the runs and drops Observed', () => {
    bootCompareState({})
    compareState.setYear(2036)
    const view = currentView()
    expect(view.active).toEqual(['base-2036', 'alt-2036'])
    expect(view.isBaseYear).toBe(false)
  })

  it('setYear ignores a year the deployment does not have', () => {
    bootCompareState({})
    compareState.setYear(1999)
    expect(compareState.getState().year).toBe(2023)
  })

  it('compare.default off starts with Compare off and the focus alone', () => {
    bootCompareState({ compareDefault: 'off' })
    expect(compareState.getState().compare).toBe(false)
    expect(currentView().active).toEqual(['base-2023'])
  })

  it('a single-year deployment with one scenario still starts with Compare on', () => {
    for (const n of ['alt-2023', 'base-2036', 'alt-2036']) appState.unregister(n)
    appState.unregister('base-2023')
    reg('only', { alternative: 'only', year: 2023 })
    try {
      bootCompareState({})
      expect(compareState.getState().compare).toBe(true)
    } finally {
      appState.unregister('only')
    }
  })

  it('the baseline resolves to its run in the current year', () => {
    bootCompareState({})
    expect(getBaselineForYear()).toBe('base-2023')
    compareState.setYear(2036)
    expect(getBaselineForYear()).toBe('base-2036')
  })

  it('toggling a scenario in the compare set applies to every year and survives a year change', () => {
    bootCompareState({})
    compareState.toggleCompareMember('alt')
    expect(currentView().active).toEqual(['obs', 'base-2023'])
    compareState.setYear(2036)
    expect(currentView().active).toEqual(['base-2036'])
    compareState.toggleCompareMember('alt')
    expect(currentView().active).toEqual(['base-2036', 'alt-2036'])
  })
})

describe('isRunInYear', () => {
  it('hides Observed and rounds outside the base year and other years runs', () => {
    const obs = appState.get('obs')!
    const b36 = appState.get('base-2036')!
    expect(isRunInYear(obs, 2023, 2023)).toBe(true)
    expect(isRunInYear(obs, 2036, 2023)).toBe(false)
    expect(isRunInYear(b36, 2036, 2023)).toBe(true)
    expect(isRunInYear(b36, 2023, 2023)).toBe(false)
  })

  it('a year-less scenario belongs to every year', () => {
    reg('plain')
    try {
      expect(isRunInYear(appState.get('plain')!, 2036, 2023)).toBe(true)
    } finally {
      appState.unregister('plain')
    }
  })
})
