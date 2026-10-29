import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetProvidersCacheForTests } from '../../src/panels/basemap/registry'
import { allowedBasemapIds, applyBasemapPolicy, BLANK_BASEMAP, firstAllowedBasemap, isBasemapAllowed, resetBasemapPolicy } from '../../src/panels/basemap/basemapPolicy'
import { configureNetwork, resetNetworkPolicy } from '../../src/services/networkPolicy'
import { getProblems, resetProblems } from '../../src/state/configProblems'

beforeEach(() => {
  resetProblems()
  resetBasemapPolicy()
  __resetProvidersCacheForTests()
})
afterEach(() => resetNetworkPolicy())

const allow = (...patterns: string[]) => configureNetwork({ basemapsAllow: patterns })

describe('with no list', () => {
  it('allows everything and changes nothing', () => {
    expect(isBasemapAllowed('openfreemap-positron')).toBe(true)
    expect(applyBasemapPolicy('openfreemap-positron', 'app-default')).toBe('openfreemap-positron')
    expect(getProblems()).toEqual([])
  })

  it('treats an empty list as no list', () => {
    allow()
    expect(isBasemapAllowed('carto-positron')).toBe(true)
  })
})

describe('with a list', () => {
  it('keeps an allowed name and reports nothing', () => {
    allow('ugrc-*', 'protomaps-light')
    expect(applyBasemapPolicy('ugrc-vector-dark', 'panel')).toBe('ugrc-vector-dark')
    expect(applyBasemapPolicy('protomaps-light', 'tab')).toBe('protomaps-light')
    expect(getProblems()).toEqual([])
  })

  it('replaces a name that is not allowed by the first allowed entry in catalogue order, and reports it', () => {
    allow('ugrc-vector-lite', 'protomaps-*')
    expect(applyBasemapPolicy('openfreemap-positron', 'app-default')).toBe('ugrc-vector-lite')
    const problems = getProblems()
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ file: 'dashboard-config.yaml', path: 'network.basemaps.allow', kind: 'invalid_value' })
    expect(problems[0].message).toContain('"openfreemap-positron" (app-default) is not allowed')
    expect(problems[0].message).toContain('"ugrc-vector-lite" is used')
  })

  it('uses the plain background when the list matches nothing', () => {
    allow('nope-*')
    expect(firstAllowedBasemap()).toBe(BLANK_BASEMAP)
    expect(applyBasemapPolicy('carto-positron', 'global')).toBe(BLANK_BASEMAP)
    expect(getProblems()[0].message).toContain('the plain background is used')
  })

  it('reports each distinct replacement once, however often it is asked', () => {
    allow('ugrc-vector-lite')
    for (let i = 0; i < 5; i++) applyBasemapPolicy('openfreemap-positron', 'app-default')
    applyBasemapPolicy('openfreemap-positron', 'panel')
    applyBasemapPolicy('carto-voyager', 'panel')
    expect(getProblems()).toHaveLength(3)
  })

  it('never blocks the deployer own composition or a full style URL, nor the plain background', () => {
    allow('nope-*')
    const composition = { layers: ['https://tiles.example.org/style.json'] }
    expect(applyBasemapPolicy(composition, 'panel')).toBe(composition)
    expect(applyBasemapPolicy('https://tiles.example.org/style.json', 'panel')).toBe('https://tiles.example.org/style.json')
    expect(applyBasemapPolicy(BLANK_BASEMAP, 'panel')).toBe(BLANK_BASEMAP)
    expect(getProblems()).toEqual([])
  })

  it('lists the allowed catalogue ids in catalogue order', () => {
    allow('protomaps-*', 'carto-positron')
    expect(allowedBasemapIds()).toEqual(['carto-positron', 'protomaps-light', 'protomaps-dark', 'protomaps-white', 'protomaps-grayscale', 'protomaps-black'])
  })

  it('matches without regard to letter case', () => {
    allow('CARTO-POSITRON')
    expect(isBasemapAllowed('carto-positron')).toBe(true)
  })
})
