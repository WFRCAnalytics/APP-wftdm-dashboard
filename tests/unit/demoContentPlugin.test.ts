import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { demoContentPlugin, demoFolders, removeDemoContent } from '../../scripts/viteDemoContentPlugin'

const made: string[] = []
function outDir(names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'wftdm-out-'))
  made.push(dir)
  for (const n of names) {
    mkdirSync(join(dir, n), { recursive: true })
    writeFileSync(join(dir, n, 'f.txt'), 'x')
  }
  writeFileSync(join(dir, 'index.html'), '<html></html>')
  return dir
}
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('demoFolders', () => {
  it('picks only names that start with demo- and keeps everything else', () => {
    expect(demoFolders(['assets', 'basemap', 'index.html', 'demo-scenarios', 'demo-geometry', 'demo-dashboard-config', 'demo-synthetic', 'demonstration', 'demo.html', 'my-demo-notes'])).toEqual([
      'demo-scenarios', 'demo-geometry', 'demo-dashboard-config', 'demo-synthetic',
    ])
  })
})

describe('removeDemoContent', () => {
  it('removes the demo folders and nothing else', () => {
    const dir = outDir(['assets', 'basemap', 'demo-scenarios', 'demo-geometry'])
    expect(removeDemoContent(dir).sort()).toEqual(['demo-geometry', 'demo-scenarios'])
    expect(existsSync(join(dir, 'assets'))).toBe(true)
    expect(existsSync(join(dir, 'basemap'))).toBe(true)
    expect(existsSync(join(dir, 'index.html'))).toBe(true)
    expect(existsSync(join(dir, 'demo-scenarios'))).toBe(false)
  })

  it('does nothing for a missing folder', () => {
    expect(removeDemoContent(join(tmpdir(), 'wftdm-does-not-exist'))).toEqual([])
  })
})

describe('demoContentPlugin', () => {
  const run = (demo: boolean, dir: string) => {
    const plugin = demoContentPlugin({ demo })
    ;(plugin.configResolved as (c: unknown) => void)({ root: dir, build: { outDir: '.' } })
    ;(plugin.closeBundle as () => void)()
  }

  it('removes the demo folders from the output when the demo is off', () => {
    const dir = outDir(['assets', 'demo-scenarios'])
    run(false, dir)
    expect(existsSync(join(dir, 'demo-scenarios'))).toBe(false)
    expect(existsSync(join(dir, 'assets'))).toBe(true)
  })

  it('leaves everything when the demo is on', () => {
    const dir = outDir(['assets', 'demo-scenarios'])
    run(true, dir)
    expect(existsSync(join(dir, 'demo-scenarios'))).toBe(true)
  })

  it('only applies to builds', () => {
    expect(demoContentPlugin({ demo: false }).apply).toBe('build')
  })
})
