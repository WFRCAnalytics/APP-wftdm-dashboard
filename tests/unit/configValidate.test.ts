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

describe('assistant providers', () => {
  const gw = { id: 'gw', base_url: 'https://llm.example.org/v1' }
  it('keeps the valid entries, reports each bad one with the assistant.providers path and skips it', () => {
    const { settings, problems } = validate({ assistant: { providers: [gw, { id: 'gw', base_url: 'https://x.org' }, { id: 'p', base_url: 'ftp://x', protocol: 'soap' }] } }, { file })
    expect((getPath(settings, 'assistant.providers') as { id: string }[]).map((p) => p.id)).toEqual(['gw'])
    expect(problems.every((p) => p.kind === 'invalid_value' && p.path === 'assistant.providers')).toBe(true)
    expect(problems.map((p) => p.message).join(' | ')).toMatch(/provider 2: id "gw" is already used.*provider 3: base_url must be an http or https address.*provider 3: unknown protocol/)
  })

  it('leaves the key unset for an empty list, a list with no usable entry and a non-list', () => {
    for (const providers of [[], [{ id: 'x' }], 'gw']) {
      const r = validate({ assistant: { providers } }, { file })
      expect(getPath(r.settings, 'assistant.providers'), JSON.stringify(providers)).toBeUndefined()
      expect(r.problems.length).toBeGreaterThan(0)
    }
  })

  it('accepts the default provider and model as text and is site-only', () => {
    expect(validate({ assistant: { default: { provider: 'gw', model: 'm' } } }, { file }).problems).toEqual([])
    expect(validate({ assistant: { default: { provider: 3 } } }, { file }).problems.map((p) => p.kind)).toEqual(['wrong_type'])
    expect(validate({ assistant: { providers: [gw] } }, { file: 'p.yaml', level: 'page' }).problems.map((p) => p.kind)).toEqual(['not_allowed_here'])
  })
})

describe('assistant note and limits', () => {
  it('accepts a note of 2000 characters and refuses one of 2001, leaving it unset with the length in the message', () => {
    expect(validate({ assistant: { prompt_addendum: 'x'.repeat(2000) } }, { file }).problems).toEqual([])
    const r = validate({ assistant: { prompt_addendum: 'x'.repeat(2001) } }, { file })
    expect(getPath(r.settings, 'assistant.prompt_addendum')).toBeUndefined()
    expect(r.problems.map((p) => [p.kind, p.path])).toEqual([['invalid_value', 'assistant.prompt_addendum']])
    expect(r.problems[0].message).toContain('2001')
  })

  it('takes each limit at its bounds and refuses one outside, keeping it unset', () => {
    const edges: [string, number, number][] = [['round_trips', 1, 12], ['preview_rows', 100, 5000], ['model_rows', 1, 200]]
    for (const [name, min, max] of edges) {
      for (const ok of [min, max]) expect(validate({ assistant: { limits: { [name]: ok } } }, { file }).problems, `${name}=${ok}`).toEqual([])
      for (const bad of [min - 1, max + 1]) {
        const r = validate({ assistant: { limits: { [name]: bad } } }, { file })
        expect(getPath(r.settings, `assistant.limits.${name}`), `${name}=${bad}`).toBeUndefined()
        expect(r.problems.map((p) => [p.kind, p.path]), `${name}=${bad}`).toEqual([['invalid_value', `assistant.limits.${name}`]])
      }
    }
  })

  it('refuses a limit that is not a whole number and a note that is not text', () => {
    expect(validate({ assistant: { limits: { round_trips: 2.5 } } }, { file }).problems.map((p) => p.kind)).toEqual(['wrong_type'])
    expect(validate({ assistant: { limits: { model_rows: 'many' } } }, { file }).problems.map((p) => p.kind)).toEqual(['wrong_type'])
    expect(validate({ assistant: { prompt_addendum: 5 } }, { file }).problems.map((p) => p.kind)).toEqual(['wrong_type'])
  })

  it('is site-only', () => {
    expect(validate({ assistant: { limits: { round_trips: 3 } } }, { file: 'p.yaml', level: 'page' }).problems.map((p) => p.kind)).toEqual(['not_allowed_here'])
  })
})

describe('secret-like keys', () => {
  const MESSAGE = 'secrets are not configuration; viewers enter their own token'

  it('refuses a secret-like key anywhere, naming it and never its value', () => {
    for (const key of ['api_key', 'token', 'Password', 'authorization', 'client_secret', 'apiKey', 'secrets']) {
      const r = validate({ assistant: { [key]: 'SECRET-VALUE-123' } }, { file })
      expect(r.problems.map((p) => [p.kind, p.path]), key).toEqual([['not_allowed_here', `assistant.${key}`]])
      expect(r.problems[0].message, key).toContain(MESSAGE)
      expect(JSON.stringify(r), key).not.toContain('SECRET-VALUE-123')
    }
    const top = validate({ api_key: 'SECRET-VALUE-123', title: 'ok' }, { file })
    expect(top.problems.map((p) => [p.kind, p.path])).toEqual([['not_allowed_here', 'api_key']])
    expect(getPath(top.settings, 'title')).toBe('ok')
    expect(JSON.stringify(top)).not.toContain('SECRET-VALUE-123')
  })

  it('does not read a secret-like group either, so nothing inside it is looked at', () => {
    const r = validate({ assistant: { credentials: { token: 'SECRET-VALUE-123' }, token: { nested: 'SECRET-VALUE-123' } } }, { file })
    expect(r.problems.map((p) => p.path).sort()).toEqual(['assistant.credentials', 'assistant.token'])
    expect(JSON.stringify(r)).not.toContain('SECRET-VALUE-123')
  })

  it('still calls an ordinary unknown key an unknown key, and keyboard or tokenizer are not secrets', () => {
    expect(validate({ assistant: { keyboard: 1, tokenizer: 2 } }, { file }).problems.map((p) => p.kind)).toEqual(['unknown_key', 'unknown_key'])
  })

  it('leaves the declared domain-restricted map key alone', () => {
    expect(validate({ basemap: { protomaps: { api_key: 'abc123' } } }, { file }).problems).toEqual([])
  })
})

describe('explore limits', () => {
  it('accepts every limit and keeps the number', () => {
    const limits = { csv_rows: 500, page_size: 25, undo_steps: 10, max_joins: 2, chart_rows: 2000, scatter_sample: 300, histogram_bins: 8, legend_series: 6, distinct_values: 80, pivot_rows: 100 }
    const { settings, problems } = validate({ explore: { limits } }, { file })
    expect(problems).toEqual([])
    expect(getPath(settings, 'explore.limits')).toEqual(limits)
  })

  it('pulls a number outside its range to the nearest end and says so', () => {
    const { settings, problems } = validate({ explore: { limits: { histogram_bins: 500, chart_rows: 10 } } }, { file })
    expect(getPath(settings, 'explore.limits.histogram_bins')).toBe(100)
    expect(getPath(settings, 'explore.limits.chart_rows')).toBe(100)
    expect(problems.map((p) => p.path).sort()).toEqual(['explore.limits.chart_rows', 'explore.limits.histogram_bins'])
    expect(problems[0].message).toMatch(/is outside/)
  })

  it('reports a text and an unknown key by path and keeps the rest', () => {
    const { settings, problems } = validate({ explore: { limits: { scatter_sample: 'lots', foo: 1, pivot_rows: 60 } } }, { file })
    expect(getPath(settings, 'explore.limits.scatter_sample')).toBeUndefined()
    expect(getPath(settings, 'explore.limits.pivot_rows')).toBe(60)
    expect(problems.map((p) => `${p.path}:${p.kind}`).sort()).toEqual(['explore.limits.foo:unknown_key', 'explore.limits.scatter_sample:wrong_type'])
  })

  it('lets a page set a limit (it cascades)', () => {
    expect(validate({ explore: { limits: { legend_series: 5 } } }, { file, level: 'page' }).problems).toEqual([])
  })
})
