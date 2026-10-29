import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkSite, explain, formatProblem } from '../../src/config'

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
