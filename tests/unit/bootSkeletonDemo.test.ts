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
