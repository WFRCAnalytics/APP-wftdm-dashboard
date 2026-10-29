import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// 066: the site settings of the old dashboard-config/index.json are gone and nothing reads them. The one allowed mention of
// that file is the leftover-file notice in services/siteConfig.ts, which only looks for the old keys to say they moved.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

const files = [...sources('src'), ...sources('scripts')].filter((f) => !f.split(sep).join('/').endsWith('src/services/siteConfig.ts'))

describe('no reader of the old index.json settings is left', () => {
  const hits = (re: RegExp) => files.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => f.split(sep).join('/'))

  it('nothing loads dashboard-config/index.json', () => {
    expect(hits(/dashboard-config\/index\.json['"`]/)).toEqual([])
  })

  it('the old parsers and their types are gone', () => {
    expect(hits(/\b(DashboardIndexJson|loadDashboardBranding|parseExportFooter)\b/)).toEqual([])
  })

  it('no code reads an old flat key off a parsed index file', () => {
    expect(hits(/\b(index|json|raw)\.(logoUrl|logoUrlDark|scenarioPalette|protomapsApiKey|protomapsPmtilesUrl|dashboards)\b/)).toEqual([])
  })
})
