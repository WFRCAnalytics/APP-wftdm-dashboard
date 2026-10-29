import { describe, expect, it } from 'vitest'

import { getPath, overlay, resolve, resolveLevels } from '../../src/config'

describe('cascade resolver', () => {
  it('lets the page win for a scalar, and others keep the site value', () => {
    const site = { layout: { mode: 'tabs' } }
    expect(getPath(resolve({ site, page: { layout: { mode: 'scroll' } } }).values, 'layout.mode')).toBe('scroll')
    expect(getPath(resolve({ site }).values, 'layout.mode')).toBe('tabs')
  })

  it('merges maps key by key', () => {
    const r = resolve({ site: { explore: { limits: { csv_rows: 100, page_size: 10 } } }, panel: { explore: { limits: { csv_rows: 500 } } } })
    expect(getPath(r.values, 'explore.limits')).toEqual({ csv_rows: 500, page_size: 10 })
  })

  it('replaces a selection list', () => {
    const r = resolve({ site: { explore: { charts: { allow: ['bar', 'line'] } } }, panel: { explore: { charts: { allow: ['pie'] } } } })
    expect(getPath(r.values, 'explore.charts.allow')).toEqual(['pie'])
  })

  it('concatenates an accumulating list, broader level first', () => {
    const r = resolve({
      site: { explore: { tables: { exclude: ['a*'] } } },
      page: { explore: { tables: { exclude: ['b*'] } } },
      panel: { explore: { tables: { exclude: ['c*'] } } },
    })
    expect(getPath(r.values, 'explore.tables.exclude')).toEqual(['a*', 'b*', 'c*'])
  })

  it('switches something off with false or [], and does not treat null as a reset', () => {
    const site = { export: { footer: true }, explore: { charts: { allow: ['bar'] } } }
    const r = resolve({ site, page: { export: { footer: false }, explore: { charts: { allow: [] } } } })
    expect(getPath(r.values, 'export.footer')).toBe(false)
    expect(getPath(r.values, 'explore.charts.allow')).toEqual([])
    // a concatenating list cannot be emptied from below
    const c = resolve({ site: { explore: { presets: [1] } }, page: { explore: { presets: [] } } })
    expect(getPath(c.values, 'explore.presets')).toEqual([1])
  })

  it('takes site-only keys from the site and ignores them below it', () => {
    const r = resolve({ site: { title: 'Site' }, page: { title: 'Page' } })
    expect(getPath(r.values, 'title')).toBe('Site')
    expect(r.source.title).toBe('site')
  })

  it('says which level supplied each value', () => {
    const r = resolve({
      site: { layout: { mode: 'tabs' }, export: { footer: 'Site footer' }, basemap: { default: 'a' } },
      page: { layout: { mode: 'scroll' } },
      panel: { basemap: { default: 'b' } },
    })
    expect(r.source['layout.mode']).toBe('page')
    expect(r.source['export.footer']).toBe('site')
    expect(r.source['basemap.default']).toBe('panel')
  })

  it('accepts an extra named level, so panel defaults can be added later', () => {
    const r = resolveLevels([
      { name: 'site', values: { layout: { mode: 'tabs' } } },
      { name: 'panel_defaults', values: { layout: { mode: 'scroll' } } },
    ])
    expect(r.source['layout.mode']).toBe('panel_defaults')
  })

  it('does not change its inputs', () => {
    const site = { explore: { tables: { exclude: ['a'] } } }
    resolve({ site, page: { explore: { tables: { exclude: ['b'] } } } })
    expect(site.explore.tables.exclude).toEqual(['a'])
  })

  it('overlay: a deployment file wins per key over the fallback, for every key', () => {
    const out = overlay({ title: 'Demo', colors: { primary: '#111111' }, years: { base: 2023 } }, { title: 'Mine', years: { base: 2020 } })
    expect(getPath(out, 'title')).toBe('Mine')
    expect(getPath(out, 'years.base')).toBe(2020)
    expect(getPath(out, 'colors.primary')).toBe('#111111')
  })
})

describe('page-scoped rows', () => {
  it('never reach the cascade or the overlay', () => {
    const schema = [{ path: 'header.note', type: 'string', cascade: false, scope: 'page', description: 'A test-only page key.' }] as never
    const tree = { header: { note: 'x' } }
    expect(getPath(resolve({ site: tree, page: tree }, schema).values, 'header.note')).toBeUndefined()
    expect(getPath(overlay(tree, tree, schema), 'header.note')).toBeUndefined()
  })
})
