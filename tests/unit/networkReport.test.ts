import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { reportAllowListProblems } from '../../src/panels/basemap/networkReport'
import { __resetProvidersCacheForTests } from '../../src/panels/basemap/registry'
import { configureNetwork, resetNetworkPolicy } from '../../src/services/networkPolicy'
import { getProblems, resetProblems } from '../../src/state/configProblems'

const providers = { OpenStreetMap: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', options: {}, variants: { Mapnik: {} } } }

beforeEach(() => {
  resetProblems()
  __resetProvidersCacheForTests()
})
afterEach(() => {
  resetNetworkPolicy()
  vi.unstubAllGlobals()
})

const serve = (ok: boolean) => vi.stubGlobal('fetch', async () => (ok ? new Response(JSON.stringify(providers), { status: 200 }) : new Response('', { status: 500 })))

describe('reportAllowListProblems', () => {
  it('says nothing without a list', async () => {
    serve(true)
    await reportAllowListProblems()
    expect(getProblems()).toEqual([])
  })

  it('says nothing for a list that matches, including a raster provider that only the provider file knows', async () => {
    serve(true)
    configureNetwork({ basemapsAllow: ['carto-*', 'OpenStreetMap.*'] })
    await reportAllowListProblems()
    expect(getProblems()).toEqual([])
  })

  it('reports each pattern that matches nothing once the provider file has loaded', async () => {
    serve(true)
    configureNetwork({ basemapsAllow: ['carto-*', 'nope-*'] })
    await reportAllowListProblems()
    expect(getProblems().map((p) => [p.path, p.message])).toEqual([['network.basemaps.allow', 'the pattern "nope-*" matches no known basemap']])
  })

  it('reports nothing when the provider file cannot be read, rather than guess', async () => {
    serve(false)
    configureNetwork({ basemapsAllow: ['OpenStreetMap.*', 'nope-*'] })
    await reportAllowListProblems()
    expect(getProblems()).toEqual([])
  })
})
