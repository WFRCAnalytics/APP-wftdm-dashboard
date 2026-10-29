import { describe, expect, it } from 'vitest'

import { getPath, validate } from '../../src/config'

const file = 'dashboard-config.yaml'

describe('validate', () => {
  it('accepts an empty file and a version-only file with no problems', () => {
    expect(validate(undefined, { file }).problems).toEqual([])
    expect(validate(null, { file }).problems).toEqual([])
    expect(validate({ version: 1 }, { file }).problems).toEqual([])
  })

  it('keeps a valid file as it is and fills only declared defaults', () => {
    const { settings, problems } = validate(
      { title: 'T', colors: { primary: '#2457D6' }, years: { list: [2023, { year: 2050, label: 'Horizon' }], base: 2023 }, layout: { mode: 'tabs' } },
      { file },
    )
    expect(problems).toEqual([])
    expect(getPath(settings, 'title')).toBe('T')
    expect(getPath(settings, 'colors.primary')).toBe('#2457D6')
    expect(getPath(settings, 'years.base')).toBe(2023)
    expect(getPath(settings, 'version')).toBe(1)
    expect(getPath(settings, 'colors.secondary')).toBeUndefined()
  })

  it('reports an unknown key by its path and ignores it', () => {
    const { settings, problems } = validate({ titel: 'x', colors: { primery: 'red' } }, { file })
    expect(problems.map((p) => [p.kind, p.path])).toEqual([['unknown_key', 'titel'], ['unknown_key', 'colors.primery']])
    expect(getPath(settings, 'titel')).toBeUndefined()
  })

  it('reports a wrong type and keeps the key unset', () => {
    const { settings, problems } = validate({ years: { base: 'two thousand' }, assistant: { enabled: 'yes' } }, { file })
    expect(problems.map((p) => [p.kind, p.path])).toEqual([['wrong_type', 'years.base'], ['wrong_type', 'assistant.enabled']])
    expect(getPath(settings, 'years.base')).toBeUndefined()
    expect(getPath(settings, 'assistant.enabled')).toBeUndefined()
  })

  it('reports an invalid colour, an invalid enum value and a URL with spaces', () => {
    const { problems } = validate({ colors: { primary: '#12' }, layout: { mode: 'grid' }, logo: { light: 'a b' } }, { file })
    expect(problems.map((p) => [p.kind, p.path])).toEqual([['invalid_value', 'colors.primary'], ['invalid_value', 'layout.mode'], ['invalid_value', 'logo.light']])
  })

  it('treats the old camelCase keys as unknown', () => {
    const { problems } = validate({ logoUrl: 'x', scenarioPalette: [], dashboards: [] }, { file })
    expect(problems.every((p) => p.kind === 'unknown_key')).toBe(true)
    expect(problems).toHaveLength(3)
  })

  it('reports a site-only key set on a page and a panel, and lets a cascading key through', () => {
    const page = validate({ title: 'x', layout: { mode: 'scroll' } }, { file: 'dashboard-1.yaml', level: 'page' })
    expect(page.problems.map((p) => [p.kind, p.path])).toEqual([['not_allowed_here', 'title']])
    expect(getPath(page.settings, 'layout.mode')).toBe('scroll')
    const panel = validate({ pages: [] }, { file: 'dashboard-1.yaml', level: 'panel' })
    expect(panel.problems[0].kind).toBe('not_allowed_here')
  })

  it('does not fill defaults below the site level', () => {
    expect(getPath(validate({}, { file, level: 'page' }).settings, 'version')).toBeUndefined()
  })

  it('reports a newer version but still reads the file, and a repeated page', () => {
    const { settings, problems } = validate({ version: 9, pages: ['a.yaml', 'a.yaml'], title: 'ok' }, { file })
    expect(problems.map((p) => [p.kind, p.path])).toEqual([['invalid_value', 'version'], ['duplicate', 'pages']])
    expect(getPath(settings, 'title')).toBe('ok')
  })

  it('reports a bad vocab entry, a bad year entry and a non-map file', () => {
    const { problems } = validate({ vocab: { modes: [{ nolabel: 1 }] }, years: { list: ['x'] } }, { file })
    expect(problems.map((p) => p.path)).toEqual(['vocab.modes', 'years.list'])
    expect(validate('just text', { file }).problems[0].kind).toBe('wrong_type')
  })

  it('treats an empty URL as unset without a problem', () => {
    const { settings, problems } = validate({ basemap: { protomaps: { pmtiles_url: '' } } }, { file })
    expect(problems).toEqual([])
    expect(getPath(settings, 'basemap.protomaps.pmtiles_url')).toBeUndefined()
  })

  it('names the file in every problem', () => {
    expect(validate({ x: 1 }, { file: 'site.yaml' }).problems[0].file).toBe('site.yaml')
  })
})

describe('page-scoped rows and the clean hook', () => {
  const schema = [
    { path: 'header.note', type: 'string', cascade: false, scope: 'page', description: 'A test-only page key.' },
    { path: 'header.flag', type: 'boolean', cascade: false, scope: 'page', default: true, description: 'A test-only page flag.' },
    {
      path: 'tabs',
      type: 'list',
      of: 'string',
      cascade: false,
      description: 'A test-only list.',
      clean: (v: unknown) => {
        const list = (v as string[]).filter((x) => x !== 'bad')
        return { value: list.length ? list : undefined, messages: (v as string[]).filter((x) => x === 'bad').map((x) => `drop ${x}`) }
      },
    },
  ] as const

  it('accepts a page-scoped row on a page and refuses it in the site file', () => {
    const onPage = validate({ header: { note: 'x' } }, { file: 'p.yaml', level: 'page', schema: schema as never })
    expect(onPage.problems).toEqual([])
    expect(getPath(onPage.settings, 'header.note')).toBe('x')
    const onSite = validate({ header: { note: 'x' } }, { file, schema: schema as never })
    expect(onSite.problems.map((p) => [p.kind, p.path])).toEqual([['not_allowed_here', 'header.note']])
    expect(getPath(onSite.settings, 'header.note')).toBeUndefined()
  })

  it('never fills a default for a page-scoped row', () => {
    expect(getPath(validate({}, { file, schema: schema as never }).settings, 'header.flag')).toBeUndefined()
  })

  it('keeps the usable part of a value and reports each thing dropped', () => {
    const r = validate({ tabs: ['a', 'bad', 'b'] }, { file, schema: schema as never })
    expect(getPath(r.settings, 'tabs')).toEqual(['a', 'b'])
    expect(r.problems.map((p) => [p.kind, p.path, p.message])).toEqual([['invalid_value', 'tabs', 'drop bad']])
  })

  it('leaves the key unset when clean returns undefined', () => {
    const r = validate({ tabs: ['bad'] }, { file, schema: schema as never })
    expect(getPath(r.settings, 'tabs')).toBeUndefined()
    expect(r.problems).toHaveLength(1)
  })
})

describe('settings.tabs', () => {
  it('keeps the valid names and reports an unknown and a repeated one with the settings.tabs path', () => {
    const { settings, problems } = validate({ settings: { tabs: ['scenarios', 'bogus', 'scenarios', 'appearance'] } }, { file })
    expect(getPath(settings, 'settings.tabs')).toEqual(['scenarios', 'appearance'])
    expect(problems.map((p) => [p.kind, p.path])).toEqual([['invalid_value', 'settings.tabs'], ['invalid_value', 'settings.tabs']])
  })

  it('leaves the key unset and says so when no usable tab is listed', () => {
    const { settings, problems } = validate({ settings: { tabs: ['bogus'] } }, { file })
    expect(getPath(settings, 'settings.tabs')).toBeUndefined()
    expect(problems.map((p) => p.message).join(' ')).toContain('all tabs are shown')
  })

  it('is a site setting: not allowed on a page', () => {
    expect(validate({ settings: { tabs: ['basemap'] } }, { file: 'p.yaml', level: 'page' }).problems.map((p) => p.kind)).toEqual(['not_allowed_here'])
  })
})
