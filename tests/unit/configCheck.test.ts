import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkSite, explain, formatProblem } from '../../src/config'
import { resolveExploreOptions } from '../../src/explore/options'

const files = (map: Record<string, string>) => (name: string) => map[name]
const page = (extra = '', tab = 'A') => `header:\n  tab: ${tab}\n  title: ${tab}\n${extra}`
const kinds = (r: ReturnType<typeof checkSite>) => r.problems.map((p) => [p.kind, p.file, p.path])

describe('check', () => {
  it('passes the real demo folder', () => {
    const folder = resolve('public/demo-dashboard-config')
    const report = checkSite((f) => (existsSync(resolve(folder, f)) ? readFileSync(resolve(folder, f), 'utf8') : undefined))
    expect(report.problems.map(formatProblem)).toEqual([])
    expect(report.pages.length).toBeGreaterThan(3)
  })

  it('reports a missing site file and invalid YAML with its line', () => {
    expect(kinds(checkSite(files({})))).toEqual([['missing_file', 'dashboard-config.yaml', '']])
    const bad = checkSite(files({ 'dashboard-config.yaml': 'title: [unclosed' }))
    expect(bad.problems[0].kind).toBe('syntax')
    expect(bad.problems[0].line).toBeGreaterThan(0)
  })

  it('reports an unknown key, a missing page, a bad page and a site-only key on a page', () => {
    const r = checkSite(
      files({
        'dashboard-config.yaml': 'titel: x\npages: [a.yaml, gone.yaml, b.yaml, c.yaml]\n',
        'a.yaml': page('title: nope\n'),
        'b.yaml': 'header: { tab: B }\n',
        'c.yaml': 'header: [unclosed',
      }),
    )
    expect(kinds(r)).toEqual([
      ['unknown_key', 'dashboard-config.yaml', 'titel'],
      ['not_allowed_here', 'a.yaml', 'title'],
      ['missing_file', 'gone.yaml', ''],
      ['invalid_value', 'b.yaml', 'header.title'],
      ['syntax', 'c.yaml', ''],
    ])
  })

  it('reports two pages that share an address, by role and not by file name', () => {
    const r = checkSite(files({ 'dashboard-config.yaml': 'pages: [x.yaml, y.yaml]\n', 'x.yaml': page('', 'Same'), 'y.yaml': page('', 'Same') }))
    expect(kinds(r)).toEqual([['duplicate', 'dashboard-config.yaml', 'pages']])
  })

  it('asks the panel check about every panel, naming the row and index', () => {
    const r = checkSite(
      files({ 'dashboard-config.yaml': 'pages: [p.yaml]\n', 'p.yaml': page('layout:\n  row_one:\n    - { type: explore-builder }\n') }),
      { panelCheck: (panel) => (panel.type === 'explore-builder' ? ['limits.csv_rows: expected a number.'] : []) },
    )
    expect(kinds(r)).toEqual([['invalid_value', 'p.yaml', 'layout.row_one[0]']])
  })

  it('explains where each cascading value comes from', () => {
    const r = checkSite(
      files({
        'dashboard-config.yaml': 'pages: [a.yaml, b.yaml]\nlayout: { mode: tabs }\n',
        'a.yaml': page('', 'A'),
        'b.yaml': page('', 'B').replace('title: B', 'title: B\n  layout_mode: scroll'),
      }),
    )
    expect(explain(r)).toEqual(['a.yaml', '  layout.mode = "tabs" (site)', 'b.yaml', '  layout.mode = "scroll" (page: b.yaml)'])
  })
})

describe('check: documentation link', () => {
  const site = (extra: string) => `pages: [p.yaml]\n${extra}`
  const withDocs = page('  docs: modes/\n')

  it('reports a page path when the site has no documentation address', () => {
    const r = checkSite(files({ 'dashboard-config.yaml': site(''), 'p.yaml': withDocs }))
    expect(kinds(r)).toEqual([['invalid_value', 'p.yaml', 'header.docs']])
  })

  it('accepts it with an address, refuses a non-web address and a full-address path', () => {
    expect(checkSite(files({ 'dashboard-config.yaml': site('docs: { url: "https://example.org/d/" }\n'), 'p.yaml': withDocs })).problems).toEqual([])
    expect(kinds(checkSite(files({ 'dashboard-config.yaml': site('docs: { url: "javascript:alert(1)" }\n'), 'p.yaml': page() })))).toEqual([['invalid_value', 'dashboard-config.yaml', 'docs.url']])
    const full = checkSite(files({ 'dashboard-config.yaml': site('docs: { url: "https://example.org/d/" }\n'), 'p.yaml': page('  docs: "https://evil.org/x"\n') }))
    expect(kinds(full)).toEqual([['invalid_value', 'p.yaml', 'header.docs']])
  })

  it('refuses header.docs in the site file', () => {
    const r = checkSite(files({ 'dashboard-config.yaml': 'header: { docs: x }\n' }))
    expect(kinds(r)).toEqual([['not_allowed_here', 'dashboard-config.yaml', 'header.docs']])
  })
})

describe('check: hidden pages', () => {
  const site = 'pages: [a.yaml, b.yaml]\n'
  const hidden = (tab: string) => page('  hidden: true\n', tab)

  it('accepts some pages hidden and a single hidden page', () => {
    expect(checkSite(files({ 'dashboard-config.yaml': site, 'a.yaml': page('', 'A'), 'b.yaml': hidden('B') })).problems).toEqual([])
    expect(checkSite(files({ 'dashboard-config.yaml': 'pages: [a.yaml]\n', 'a.yaml': hidden('A') })).problems).toEqual([])
  })

  it('reports every page hidden, once', () => {
    const r = checkSite(files({ 'dashboard-config.yaml': site, 'a.yaml': hidden('A'), 'b.yaml': hidden('B') }))
    expect(kinds(r)).toEqual([['invalid_value', 'dashboard-config.yaml', 'pages']])
  })

  it('reports a hidden flag that is not true or false', () => {
    const r = checkSite(files({ 'dashboard-config.yaml': site, 'a.yaml': page('  hidden: yes please\n', 'A'), 'b.yaml': page('', 'B') }))
    expect(kinds(r)).toEqual([['wrong_type', 'a.yaml', 'header.hidden']])
  })

  it('refuses header.hidden in the site file', () => {
    expect(kinds(checkSite(files({ 'dashboard-config.yaml': 'header: { hidden: true }\n' })))).toEqual([['not_allowed_here', 'dashboard-config.yaml', 'header.hidden']])
  })
})

describe('check: assistant settings', () => {
  const only = (yaml: string) => checkSite(files({ 'dashboard-config.yaml': yaml }))
  const GW = 'providers:\n      - { id: gw, base_url: "https://llm.example.org/v1" }\n      - { id: two, base_url: "https://two.example.org" }\n'

  it('passes a good block', () => {
    expect(only(`assistant:\n  ${GW}  default: { provider: two, model: m }\n  prompt_addendum: Our zones are called TAZs.\n  limits: { round_trips: 3, preview_rows: 200, model_rows: 20 }\n`).problems).toEqual([])
  })

  it('reports a default that names an unlisted provider, naming the offered ones', () => {
    const r = only(`assistant:\n  ${GW}  default: { provider: openai }\n`)
    expect(kinds(r)).toEqual([['invalid_value', 'dashboard-config.yaml', 'assistant.default.provider']])
    expect(r.problems[0].message).toContain('(gw, two)')
  })

  it('accepts a built-in default when there is no list, and reports an unknown one', () => {
    expect(only('assistant:\n  default: { provider: ollama }\n').problems).toEqual([])
    expect(kinds(only('assistant:\n  default: { provider: nope }\n'))).toEqual([['invalid_value', 'dashboard-config.yaml', 'assistant.default.provider']])
  })

  it('reports an empty list and a list with no usable entry, once each, and the built-ins stay', () => {
    expect(kinds(only('assistant:\n  providers: []\n'))).toEqual([['invalid_value', 'dashboard-config.yaml', 'assistant.providers']])
    const r = only('assistant:\n  providers:\n    - { id: x }\n')
    expect(r.problems.map((p) => p.path)).toEqual(['assistant.providers', 'assistant.providers'])
    expect(r.problems.at(-1)?.message).toContain('built-in providers are used')
  })

  it('reports a secret-like field once and never prints its value', () => {
    const r = only('assistant:\n  api_key: SECRET-123\n  providers:\n    - { id: gw, base_url: "https://llm.example.org/v1", token: SECRET-456 }\n')
    expect(JSON.stringify(r.problems)).not.toContain('SECRET-')
    expect(r.problems.map((p) => [p.kind, p.path])).toEqual([['not_allowed_here', 'assistant.api_key'], ['invalid_value', 'assistant.providers']])
    expect(r.problems.every((p) => p.message.includes('secrets are not configuration'))).toBe(true)
  })

  it('reports each limit out of range and an over-long note', () => {
    const r = only(`assistant:\n  prompt_addendum: "${'x'.repeat(2001)}"\n  limits: { round_trips: 99, preview_rows: 5, model_rows: 500 }\n`)
    expect(r.problems.map((p) => p.path)).toEqual(['assistant.prompt_addendum', 'assistant.limits.round_trips', 'assistant.limits.preview_rows', 'assistant.limits.model_rows'])
  })
})

describe('check: explore settings', () => {
  const site = (explore: string) => `pages: [p.yaml]\nexplore:\n${explore}`
  const withPanel = page('layout:\n  row_one:\n    - { type: explore-builder }\n')
  const run = (explore: string) =>
    checkSite(files({ 'dashboard-config.yaml': site(explore), 'p.yaml': withPanel }), {
      panelCheck: (panel, s) => (panel.type === 'explore-builder' ? resolveExploreOptions(panel, s).warnings : []),
    })

  it('is clean for valid limits and a starting chart', () => {
    expect(run('  limits: { chart_rows: 2000, legend_series: 6 }\n  charts: { default: line }\n').problems).toEqual([])
  })

  it('reports each kind of mistake once, with its path', () => {
    const r = run('  limits: { chart_rows: 10, scatter_sample: lots, foo: 1 }\n  charts: { default: spiral }\n')
    const lines = r.problems.map((p) => `${p.path}: ${p.message}`)
    expect(lines.filter((l) => l.startsWith('explore.limits.chart_rows'))).toHaveLength(1)
    expect(lines.filter((l) => l.startsWith('explore.limits.scatter_sample'))).toHaveLength(1)
    expect(lines.filter((l) => l.startsWith('explore.limits.foo'))).toHaveLength(1)
    // a chart name is checked against the allowed charts by the panel check, once, under the panel
    expect(r.problems.filter((p) => p.path === 'layout.row_one[0]' && /charts\.default: "spiral"/.test(p.message))).toHaveLength(1)
    expect(r.problems).toHaveLength(4)
  })

  it('does not repeat a site limit mistake under the panel', () => {
    const r = run('  limits: { histogram_bins: 500 }\n')
    expect(r.problems.map((p) => p.path)).toEqual(['explore.limits.histogram_bins'])
  })

  it('reports a default chart that the site allow-list hides, under the panel', () => {
    const r = run('  charts: { allow: [bar, pie], default: line }\n')
    expect(r.problems.map((p) => p.path)).toEqual(['layout.row_one[0]'])
  })
})

describe('check: network block', () => {
  const ids = ['carto-positron', 'openfreemap-positron', 'ugrc-vector-lite', 'protomaps-light', 'OpenStreetMap.Mapnik']
  const network = { basemapIds: ids, appDefault: 'openfreemap-positron', catalogue: ids.map((id) => ({ id, hosts: [] as string[] })) }
  const site = (extra: string) => `pages: [p.yaml]\n${extra}`
  const onePage = page('layout:\n  row_one:\n    - { type: markdown, title: Hi, content: x }\n')
  const run = (extra: string, pageBody = onePage) => checkSite(files({ 'dashboard-config.yaml': site(extra), 'p.yaml': pageBody }), { network })
  const paths = (r: ReturnType<typeof checkSite>) => r.problems.map((p) => `${p.file}:${p.path}`)

  it('is clean without the block, and for a list that matches with an allowed default', () => {
    expect(run('').problems).toEqual([])
    expect(run('network: { basemaps: { allow: ["openfreemap-*", "ugrc-*"] } }\n').problems).toEqual([])
  })

  it('reports each pattern that matches nothing, once, with its path', () => {
    const r = run('network: { basemaps: { allow: ["openfreemap-*", "nope-*", "nada"] } }\n')
    expect(r.problems.filter((p) => p.path === 'network.basemaps.allow').map((p) => p.message)).toEqual(['the pattern "nope-*" matches no known basemap', 'the pattern "nada" matches no known basemap'])
  })

  it('reports a list that allows nothing', () => {
    const messages = run('network: { basemaps: { allow: ["nope-*"] } }\n').problems.map((p) => p.message)
    expect(messages).toContain('no basemap is allowed, so every map shows the plain background')
  })

  it('reports the app default when nothing sets a default and it is not allowed', () => {
    const r = run('network: { basemaps: { allow: ["ugrc-vector-lite"] } }\n')
    const p = r.problems.find((x) => x.path === 'basemap.default')!
    expect(p.file).toBe('dashboard-config.yaml')
    expect(p.message).toContain('"openfreemap-positron" is not allowed')
    expect(p.message).toContain('"ugrc-vector-lite" is used')
    expect(p.message).toContain('the app default applies')
  })

  it('reports a site default that is not allowed, without the app-default remark', () => {
    const r = run('basemap: { default: carto-positron }\nnetwork: { basemaps: { allow: ["ugrc-*"] } }\n')
    const p = r.problems.find((x) => x.path === 'basemap.default')!
    expect(p.message).toContain('"carto-positron" is not allowed')
    expect(p.message).not.toContain('the app default applies')
  })

  it('is quiet when the site default is allowed, even if the app default is not', () => {
    expect(run('basemap: { default: ugrc-vector-lite }\nnetwork: { basemaps: { allow: ["ugrc-*"] } }\n').problems).toEqual([])
  })

  it('reports a page default and a panel basemap that are not allowed, under the page', () => {
    const body = page('default_basemap: carto-positron\nlayout:\n  row_one:\n    - { type: zonemap, title: Z, basemap: openfreemap-positron }\n    - { type: zonemap, title: Y, basemap: ugrc-vector-lite }\n')
    const r = run('basemap: { default: ugrc-vector-lite }\nnetwork: { basemaps: { allow: ["ugrc-*"] } }\n', body)
    expect(paths(r)).toEqual(['p.yaml:basemap.default', 'p.yaml:layout.row_one[0].basemap'])
  })

  it('never reports a style URL or a style written in the page', () => {
    const body = page('layout:\n  row_one:\n    - { type: zonemap, title: Z, basemap: "https://tiles.example.org/style.json" }\n    - { type: zonemap, title: Y, basemap: { layers: ["https://tiles.example.org/a.json"] } }\n')
    expect(run('basemap: { default: ugrc-vector-lite }\nnetwork: { basemaps: { allow: ["ugrc-*"] } }\n', body).problems).toEqual([])
  })

  it('does nothing without a catalogue (an older caller)', () => {
    expect(checkSite(files({ 'dashboard-config.yaml': site('network: { basemaps: { allow: ["nope-*"] } }\n'), 'p.yaml': onePage })).problems).toEqual([])
  })
})

describe('check --explain: outside hosts', () => {
  const catalogue = [
    { id: 'carto-positron', hosts: ['basemaps.cartocdn.com'] },
    { id: 'ugrc-vector-lite', hosts: ['tiles.arcgis.com'] },
    { id: 'protomaps-light', hosts: [] as string[] },
  ]
  const page1 = page('layout:\n  row_one:\n    - { type: zonemap, title: Z, basemap: "https://tiles.selfhosted.example.org/style.json" }\n')
  const run = (extra: string) => checkSite(files({ 'dashboard-config.yaml': `pages: [p.yaml]\n${extra}`, 'p.yaml': page1 }), { network: { basemapIds: catalogue.map((e) => e.id), appDefault: 'carto-positron', catalogue } })
  const hostLines = (extra: string) => explain(run(extra), { catalogue }).filter((l) => !l.startsWith('p.yaml') && !l.startsWith('  layout'))

  it('lists fonts, the extension host, the allowed basemap hosts and a style written in a page', () => {
    const lines = hostLines('')
    expect(lines[0]).toBe('outside hosts this configuration can still reach:')
    const text = lines.join('\n')
    expect(text).toMatch(/fonts\.googleapis\.com\s+fonts are not bundled/)
    expect(text).toMatch(/extensions\.duckdb\.org\s+no network\.duckdb_extensions/)
    expect(text).toMatch(/basemaps\.cartocdn\.com\s+allowed basemap carto-positron/)
    expect(text).toMatch(/tiles\.selfhosted\.example\.org\s+a style written in p\.yaml layout\.row_one\[0\]\.basemap/)
  })

  it('says no outside host is known when everything is self-hosted', () => {
    const lines = explain(
      checkSite(files({ 'dashboard-config.yaml': 'pages: [p.yaml]\nnetwork: { fonts: bundled, duckdb_extensions: "https://m.example.org/x", basemaps: { allow: ["protomaps-*"] } }\nbasemap: { default: protomaps-light }\n', 'p.yaml': page('layout:\n  row_one:\n    - { type: markdown, title: Hi, content: x }\n') }), { network: { basemapIds: catalogue.map((e) => e.id), appDefault: 'carto-positron', catalogue } }),
      { catalogue },
    )
    expect(lines.at(-1)).toBe('no outside host is known')
  })

  it('adds nothing without --explain data, and never changes the problems or the exit state', () => {
    const r = run('')
    expect(explain(r).some((l) => l.includes('outside hosts'))).toBe(false)
    expect(r.problems).toEqual([])
  })
})
