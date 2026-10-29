import { describe, expect, it } from 'vitest'

import { firstRunState } from '../../src/services/firstRun'

const folder = '/app/dashboard-config/'

describe('firstRunState', () => {
  it('is nothing once a page loaded', () => {
    expect(firstRunState({ siteFound: true, listed: 3, loaded: 1, searched: folder })).toBeNull()
  })

  it('says no site configuration was found, with the folder and the next steps', () => {
    const s = firstRunState({ siteFound: false, listed: 0, loaded: 0, searched: folder })!
    expect(s.kind).toBe('no_site')
    expect(s.title).toBe('No site configuration was found')
    expect(s.searched).toBe(folder)
    expect(s.steps.join(' ')).toContain('dashboard-config.yaml')
    expect(s.steps.join(' ')).toContain('npm run build:demo')
  })

  it('says the site lists no pages, apart from a missing site file', () => {
    const s = firstRunState({ siteFound: true, listed: 0, loaded: 0, searched: folder })!
    expect(s.kind).toBe('no_pages')
    expect(s.title).toBe('The site lists no pages')
  })

  it('says when pages are listed but none could be read', () => {
    const s = firstRunState({ siteFound: true, listed: 2, loaded: 0, searched: folder })!
    expect(s.kind).toBe('pages_unreadable')
    expect(s.message).toContain('2 pages')
  })

  it('holds plain text only (no markup)', () => {
    for (const input of [{ siteFound: false, listed: 0 }, { siteFound: true, listed: 0 }, { siteFound: true, listed: 1 }]) {
      const s = firstRunState({ ...input, loaded: 0, searched: folder })!
      expect(`${s.title} ${s.message} ${s.steps.join(' ')}`).not.toMatch(/[<>]/)
    }
  })
})
