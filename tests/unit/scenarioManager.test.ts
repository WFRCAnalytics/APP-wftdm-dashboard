// T008/T015/T030 (009-scenario-manager): isLocalDeployment()/
// supportsLocalFolderLoading() — WEB/LOCAL deployment-mode detection and
// File System Access API feature detection. Pure logic, no real browser
// needed (vitest.config.js's environment: 'node' — a plain object
// stand-in for `window` suffices).
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as appState from '../../src/state/appState.ts'
import * as duckdb from '../../src/services/duckdb.ts'
import {
  isLocalDeployment,
  removeLocalScenario,
  supportsLocalFolderLoading,
} from '../../src/scenario/scenarioManager.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('scenarioManager.isLocalDeployment', () => {
  it('is true on localhost', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost' } })
    expect(isLocalDeployment()).toBe(true)
  })

  it('is false on a hosted origin', () => {
    vi.stubGlobal('window', { location: { hostname: 'wfrcanalytics.github.io' } })
    expect(isLocalDeployment()).toBe(false)
  })
})

describe('scenarioManager.supportsLocalFolderLoading', () => {
  it('is true when window.showDirectoryPicker is a function', () => {
    vi.stubGlobal('window', { showDirectoryPicker: () => {} })
    expect(supportsLocalFolderLoading()).toBe(true)
  })

  it('is false when window.showDirectoryPicker is absent (Firefox/Safari)', () => {
    vi.stubGlobal('window', {})
    expect(supportsLocalFolderLoading()).toBe(false)
  })
})

// T015: the collision-classification decision, tested in isolation via
// appState directly (real module, not mocked — appState.ts's own API is
// simple enough to drive real fixture state) — never through a real
// showDirectoryPicker() call, which is research.md §2's Playwright concern.
describe('scenarioManager collision classification (via loadLocalScenario\'s decision)', () => {
  afterEach(() => {
    for (const name of ['published_sc', 'local_sc']) appState.unregister(name)
  })

  it('classifies a name colliding with a published (source: url) scenario as reject', async () => {
    appState.register('published_sc', { source: 'url', path: 'test/published_sc' })
    const { classifyCollision } = await import('../../src/scenario/scenarioManager.ts')
    expect(classifyCollision('published_sc')).toBe('reject')
  })

  it('classifies a name colliding with an already-loaded local (source: handle) scenario as proceed', async () => {
    appState.register('local_sc', { source: 'handle', path: 'test/local_sc' })
    const { classifyCollision } = await import('../../src/scenario/scenarioManager.ts')
    expect(classifyCollision('local_sc')).toBe('proceed')
  })

  it('classifies a name with no existing registration as proceed', async () => {
    const { classifyCollision } = await import('../../src/scenario/scenarioManager.ts')
    expect(classifyCollision('never_registered_xyz')).toBe('proceed')
  })
})

// T030: removeLocalScenario()'s pure call sequence — unregisterScenario()
// before appState.unregister(), in that order.
describe('scenarioManager.removeLocalScenario', () => {
  it('calls duckdb.unregisterScenario then appState.unregister, in that order', async () => {
    const calls: string[] = []
    const unregisterScenarioSpy = vi
      .spyOn(duckdb, 'unregisterScenario')
      .mockImplementation(async () => {
        calls.push('duckdb.unregisterScenario')
      })
    const appStateUnregisterSpy = vi.spyOn(appState, 'unregister').mockImplementation(() => {
      calls.push('appState.unregister')
    })

    await removeLocalScenario('some_local_scenario')

    expect(calls).toEqual(['duckdb.unregisterScenario', 'appState.unregister'])
    unregisterScenarioSpy.mockRestore()
    appStateUnregisterSpy.mockRestore()
  })
})
