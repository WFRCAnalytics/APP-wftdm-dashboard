import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { viewIcon } from '@/panels/viewIcon'

// Every multi-view tile in the shipped and synthetic demo pages.
function tiles(): { file: string; title: string; views: Record<string, unknown>[] }[] {
  const out: { file: string; title: string; views: Record<string, unknown>[] }[] = []
  const walk = (node: unknown, file: string) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, file))
    if (!node || typeof node !== 'object') return
    const o = node as Record<string, unknown>
    if (o.type === 'multi-view' && Array.isArray(o.views)) out.push({ file, title: String(o.title ?? o.id), views: o.views as Record<string, unknown>[] })
    Object.values(o).forEach((v) => walk(v, file))
  }
  for (const dir of ['public/demo-dashboard-config', 'public/demo-synthetic/dashboard-config']) {
    let files: string[] = []
    try {
      files = readdirSync(dir).filter((f) => /^dashboard-.*\.ya?ml$/.test(f))
    } catch {
      continue
    }
    for (const f of files) walk(yaml.load(readFileSync(join(dir, f), 'utf8')), `${dir}/${f}`)
  }
  return out
}

describe('viewIcon', () => {
  it("gives the zone maps' Values, Difference and Swipe views their own icons", () => {
    const icons = ['zone-map', 'zone-diff-map', 'zone-swipe-map'].map((kind) => viewIcon({ type: 'chart', kind }))
    expect(new Set(icons).size).toBe(3)
  })

  it('an icon set by the view wins over its kind', () => {
    expect(viewIcon({ type: 'chart', kind: 'zone-diff-map', icon: 'table' })).toBe(viewIcon({ type: 'table' }))
  })

  it('no demo tile shows two views with the same icon', () => {
    const clashes = tiles().flatMap(({ file, title, views }) => {
      const seen = new Map<unknown, string>()
      const out: string[] = []
      for (const v of views) {
        const icon = viewIcon(v)
        const label = String(v.label ?? v.id)
        if (seen.has(icon)) out.push(`${file} "${title}": ${seen.get(icon)} and ${label}`)
        else seen.set(icon, label)
      }
      return out
    })
    expect(clashes).toEqual([])
  })
})
