// Test-only (WFTDM_LEGACY_DEMO=1): serves the pre-redesign demo content (tests/fixtures/legacy-demo) in place of the
// Corridor Pro demo, so the older Playwright specs, written against ActivitySim example panels, keep running against the
// content they assert on. The redesign specs run against the real demo on a second dev server.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const BASE = '/APP-wftdm-dashboard/'

export function legacyDemoPlugin(): Plugin {
  const root = resolve(__dirname, '..')
  return {
    name: 'wftdm-legacy-demo',
    apply: 'serve',
    configureServer(server) {
      if (process.env.WFTDM_LEGACY_DEMO !== '1') return
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        const send = (body: string, type: string) => {
          res.setHeader('Content-Type', type)
          res.end(body)
        }
        let m = url.startsWith(`${BASE}demo-dashboard-config/`) ? url.slice(`${BASE}demo-dashboard-config/`.length) : null
        if (m) {
          const file = resolve(root, 'tests/fixtures/legacy-demo/dashboard-config', m)
          if (existsSync(file)) return send(readFileSync(file, 'utf8'), m.endsWith('.json') ? 'application/json' : 'text/yaml')
        }
        if (url === `${BASE}demo-scenarios/index.json`) {
          return send(readFileSync(resolve(root, 'tests/fixtures/legacy-demo/scenarios-index.json'), 'utf8'), 'application/json')
        }
        m = /^\/APP-wftdm-dashboard\/demo-scenarios\/(activitysim-[^/]+)\/manifest\.yaml$/.exec(url)?.[1] ?? null
        if (m) {
          const file = resolve(root, 'public/demo-scenarios', m, 'manifest.yaml')
          if (existsSync(file)) return send(readFileSync(file, 'utf8').replace(/^hidden: true\s*$/m, '').replace(/^display_name:.*$/m, ''), 'text/yaml')
        }
        next()
      })
    },
  }
}
