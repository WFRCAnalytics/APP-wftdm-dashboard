import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadSite } from '../../src/services/siteConfig'
import { resetProblems as clearProblems } from '../../src/state/configProblems'

const DEPLOY = '/app/dashboard-config/'
const DEMO = '/app/demo-dashboard-config/'

function serve(files: Record<string, string>) {
  const fetched: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url)
    const body = files[url]
    return body === undefined
      ? new Response('', { status: 404 })
      : new Response(body, { status: 200, headers: { 'content-type': 'text/yaml' } })
  })
  return fetched
}

beforeEach(() => clearProblems())
afterEach(() => vi.unstubAllGlobals())

describe('loadSite with the demo off (no demo URL)', () => {
  it('uses the deployment root alone: its values and its pages, nothing else', async () => {
    const fetched = serve({ [`${DEPLOY}dashboard-config.yaml`]: 'title: Agency\npages: [a.yaml, b.yaml]\n' })
    const site = await loadSite(DEPLOY)
    expect(site.branding.title).toBe('Agency')
    expect(site.pageSources).toEqual([{ baseUrl: DEPLOY, pages: ['a.yaml', 'b.yaml'] }])
    expect(site.siteFound).toBe(true)
    expect(fetched.every((u) => !u.includes('demo-'))).toBe(true)
  })

  it('leaves everything the deployment did not set at the neutral default', async () => {
    serve({ [`${DEPLOY}dashboard-config.yaml`]: 'title: Agency\npages: [a.yaml]\n' })
    const site = await loadSite(DEPLOY)
    expect(site.branding.logoUrl).toBeUndefined()
    expect(site.branding.protomapsApiKey).toBeUndefined()
    expect(site.branding.primaryColor).toBeUndefined()
  })

  it('reports a missing site file as "no site configuration was found" and says where it looked', async () => {
    serve({})
    const site = await loadSite(DEPLOY)
    expect(site.siteFound).toBe(false)
    expect(site.searched).toBe(DEPLOY)
    expect(site.pageSources).toEqual([{ baseUrl: DEPLOY, pages: [] }])
    expect(site.problems.map((p) => [p.kind, p.message])).toEqual([['missing_file', 'no site configuration was found']])
  })
})

describe('loadSite with a demo URL (the demo on)', () => {
  const files = {
    [`${DEPLOY}dashboard-config.yaml`]: 'title: Agency\npages: [a.yaml]\n',
    [`${DEMO}dashboard-config.yaml`]: 'title: Demo\ncolors: { primary: "#112233" }\nbasemap: { protomaps: { api_key: demo-key } }\npages: [d.yaml]\n',
  }

  it('lets the deployment win per setting and the demo fill the rest, pages deployment first (as before)', async () => {
    serve(files)
    const site = await loadSite(DEPLOY, DEMO)
    expect(site.branding.title).toBe('Agency')
    expect(site.branding.primaryColor).toBe('#112233')
    expect(site.pageSources.map((s) => [s.baseUrl, s.pages])).toEqual([[DEPLOY, ['a.yaml']], [DEMO, ['d.yaml']]])
  })

  it('is the demo alone when the deployment has no site file, and that counts as a site', async () => {
    serve({ [`${DEMO}dashboard-config.yaml`]: files[`${DEMO}dashboard-config.yaml`] })
    const site = await loadSite(DEPLOY, DEMO)
    expect(site.branding.title).toBe('Demo')
    expect(site.siteFound).toBe(true)
    expect(site.problems).toEqual([])
  })
})
