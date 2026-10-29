import { describe, expect, it } from 'vitest'

import { docsHref, docsLabel, isRelativePath, isWebAddress } from '../../src/config'

describe('isWebAddress', () => {
  it('accepts http and https addresses only', () => {
    expect(isWebAddress('https://example.org/docs/')).toBe(true)
    expect(isWebAddress('http://localhost:4000')).toBe(true)
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.org', 'file:///c:/x', 'example.org', '', '   ', 'https://exa mple.org']) {
      expect(isWebAddress(bad), bad).toBe(false)
    }
  })
})

describe('isRelativePath', () => {
  it('accepts a path with an optional fragment or query and refuses an address', () => {
    for (const ok of ['modes/', '/modes', 'modes/#shares', '?a=1', 'a/b/c']) expect(isRelativePath(ok), ok).toBe(true)
    for (const bad of ['', ' ', 'https://x.org/y', 'javascript:1', '//evil.org/x', 'mailto:a@b.c']) expect(isRelativePath(bad), bad).toBe(false)
  })
})

describe('docsHref', () => {
  it('joins the address and the page path with exactly one slash', () => {
    for (const url of ['https://example.org/docs', 'https://example.org/docs/', 'https://example.org/docs//']) {
      for (const path of ['modes/', '/modes/']) expect(docsHref(url, path), `${url} + ${path}`).toBe('https://example.org/docs/modes/')
    }
  })

  it('keeps a fragment or query as given', () => {
    expect(docsHref('https://example.org/docs/', 'modes/#shares')).toBe('https://example.org/docs/modes/#shares')
    expect(docsHref('https://example.org/docs/', '?v=2')).toBe('https://example.org/docs/?v=2')
  })

  it('returns the address alone for no path, an empty path or a path that is itself an address', () => {
    expect(docsHref('https://example.org/docs/')).toBe('https://example.org/docs/')
    expect(docsHref('https://example.org/docs/', '')).toBe('https://example.org/docs/')
    expect(docsHref('https://example.org/docs/', 'https://evil.org/x')).toBe('https://example.org/docs/')
    expect(docsHref('https://example.org/docs/', '//evil.org/x')).toBe('https://example.org/docs/')
  })

  it('returns undefined without a usable address', () => {
    expect(docsHref(undefined, 'a/')).toBeUndefined()
    expect(docsHref('javascript:alert(1)', 'a/')).toBeUndefined()
    expect(docsHref('docs.example.org')).toBeUndefined()
  })
})

describe('docsLabel', () => {
  it('defaults to Documentation', () => {
    expect(docsLabel(undefined)).toBe('Documentation')
    expect(docsLabel('  ')).toBe('Documentation')
    expect(docsLabel(' Help ')).toBe('Help')
  })
})
