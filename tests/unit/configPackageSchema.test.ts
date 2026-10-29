import { describe, expect, it } from 'vitest'
import { resolveConfig } from 'vite'

// 072-python-local-server: the Vite modes. `package` builds the app that fills the Python library: relative, so it works from any address and
// port, and with no demo content (070: the demo is only the dev server and mode `demo`).
const resolve = (command: 'build' | 'serve', mode: string) => resolveConfig({ configFile: 'vite.config.ts', mode, logLevel: 'silent' }, command, mode)

describe('the base of each Vite mode', () => {
  it('is relative in mode package', async () => {
    expect((await resolve('build', 'package')).base).toBe('./')
  })

  it('stays the Pages path for the default build and the demo build', async () => {
    expect((await resolve('build', 'production')).base).toBe('/APP-wftdm-dashboard/')
    expect((await resolve('build', 'demo')).base).toBe('/APP-wftdm-dashboard/')
  })

  it('stays the Pages path for the dev server (the Playwright projects rely on it)', async () => {
    expect((await resolve('serve', 'development')).base).toBe('/APP-wftdm-dashboard/')
  })
})

describe('the demo flag in mode package', () => {
  const demo = async (command: 'build' | 'serve', mode: string) => (await resolve(command, mode)).define?.['import.meta.env.VITE_WFTDM_DEMO']

  it('is off for package and the default build, on for demo and the dev server', async () => {
    expect(await demo('build', 'package')).toBe('""')
    expect(await demo('build', 'production')).toBe('""')
    expect(await demo('build', 'demo')).toBe('"1"')
    expect(await demo('serve', 'development')).toBe('"1"')
  })
})
