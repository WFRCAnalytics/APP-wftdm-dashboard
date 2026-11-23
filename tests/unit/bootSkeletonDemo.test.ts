import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { bootSkeletonPlugin } from '../../scripts/viteBootSkeletonPlugin'

const page = '<body><!-- BOOT_SKELETON -->old<!-- /BOOT_SKELETON --></body>'
const run = (demo: boolean): string => {
  const hook = bootSkeletonPlugin({ demo }).transformIndexHtml as (html: string) => string
  return hook(page)
}

describe('070: the boot skeleton follows the demo flag', () => {
  it('shows the demo tabs when the demo is on', () => {
    expect(run(true)).toContain('Summary')
  })

  it('shows none of the demo tabs when the demo is off and there is no deployment folder', () => {
    // the deployment's own folder is gitignored; this guards the assumption of the next assertion
    if (existsSync('public/dashboard-config/dashboard-config.yaml')) return
    const html = run(false)
    expect(html).not.toContain('Summary')
    expect(html).not.toContain('Explore')
  })

  it('keeps the marker pair either way', () => {
    for (const demo of [true, false]) expect(run(demo)).toMatch(/<!-- BOOT_SKELETON -->[\s\S]*<!-- \/BOOT_SKELETON -->/)
  })
})

describe('the boot skeleton draws the rail as the app does', () => {
  const nav = (html: string): string => html.slice(html.indexOf('<nav'), html.indexOf('</nav>'))
  const footer = (html: string): string => nav(html).slice(nav(html).indexOf('border-t'))

  it('fills the landing tab and only that one', () => {
    const tabs = nav(run(true)).match(/<div role="tab"[^>]*>/g) ?? []
    expect(tabs.length).toBeGreaterThan(1)
    expect(tabs[0]).toContain('h-[46px] w-full shrink-0 rounded-[15px]')
    expect(tabs.slice(1).every((t) => t.includes('px-[14px]'))).toBe(true)
  })

  it('puts the theme circle first in the footer, then documentation (demo sets docs.url), Settings and the labels toggle', () => {
    const rows = footer(run(true)).match(/<div class="flex h-\[46px\][^"]*">/g) ?? []
    expect(rows).toHaveLength(4)
    expect(rows[0]).toContain("px-[6px]")
    expect(footer(run(true))).toContain("h-9 w-9 shrink-0 rounded-full")
  })

  it('leaves the documentation row out when no docs.url is set', () => {
    if (existsSync('public/dashboard-config/dashboard-config.yaml')) return
    const rows = footer(run(false)).match(/<div class="flex h-\[46px\][^"]*">/g) ?? []
    expect(rows).toHaveLength(3)
  })
})
