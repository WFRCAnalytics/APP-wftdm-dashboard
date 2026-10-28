// Test-only demo content switch for the dev server (WFTDM_DEMO):
//   (unset)     the real demo: the ActivitySim example runs and the redesigned pages in public/demo-*
//   legacy      the pre-redesign pages for those runs (tests/fixtures/legacy-demo), for the older Playwright specs
//   synthetic   the synthetic Corridor Pro dataset (public/demo-synthetic: 15 scenario groups x 6 years, observed, rounds)
//               and its pages, for the redesign specs; the real ActivitySim runs stay available but hidden
// Everything else is served untouched by Vite (so Parquet range requests keep working).
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const BASE = '/APP-wftdm-dashboard/'

export function legacyDemoPlugin(): Plugin {
  const root = resolve(__dirname, '..')
  const mode = process.env.WFTDM_DEMO ?? (process.env.WFTDM_LEGACY_DEMO === '1' ? 'legacy' : '')
  return {
    name: 'wftdm-demo-content',
    apply: 'serve',
    configureServer(server) {
      if (mode !== 'legacy' && mode !== 'synthetic') return
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        const query = (req.url ?? '').includes('?') ? `?${(req.url ?? '').split('?')[1]}` : ''
        const send = (body: string, type: string) => {
          res.setHeader('Content-Type', type)
          res.end(body)
        }
        const realManifest = /^\/APP-wftdm-dashboard\/demo-scenarios\/(activitysim-[^/]+)\/manifest\.yaml$/.exec(url)?.[1]

        if (mode === 'legacy') {
          const cfg = url.startsWith(`${BASE}demo-dashboard-config/`) ? url.slice(`${BASE}demo-dashboard-config/`.length) : null
          if (cfg) {
            const file = resolve(root, 'tests/fixtures/legacy-demo/dashboard-config', cfg)
            if (existsSync(file)) return send(readFileSync(file, 'utf8'), cfg.endsWith('.json') ? 'application/json' : 'text/yaml')
          }
          if (url === `${BASE}demo-scenarios/index.json`) {
            return send(readFileSync(resolve(root, 'tests/fixtures/legacy-demo/scenarios-index.json'), 'utf8'), 'application/json')
          }
          if (realManifest) {
            const real = resolve(root, 'public/demo-scenarios', realManifest, 'manifest.yaml')
            const file = existsSync(real) ? real : resolve(root, 'public/demo-synthetic/scenarios', realManifest, 'manifest.yaml')
            if (existsSync(file)) {
              return send(readFileSync(file, 'utf8').replace(/^display_name:.*$/m, '').replace(/^hidden: true\s*$/m, ''), 'text/yaml')
            }
          }
          // the synthetic 2036 copies of the real runs (the older multi-year specs use them) live in the synthetic set
          if (url.startsWith(`${BASE}demo-scenarios/`)) {
            const rel = url.slice(`${BASE}demo-scenarios/`.length)
            if (!existsSync(resolve(root, 'public/demo-scenarios', rel)) && existsSync(resolve(root, 'public/demo-synthetic/scenarios', rel))) {
              req.url = `${BASE}demo-synthetic/scenarios/${rel}${query}`
            }
          }
          return next()
        }

        // synthetic
        if (realManifest) {
          const file = resolve(root, 'public/demo-scenarios', realManifest, 'manifest.yaml')
          if (existsSync(file)) return send(`${readFileSync(file, 'utf8').trimEnd()}\nhidden: true\n`, 'text/yaml')
        }
        if (url.startsWith(`${BASE}demo-dashboard-config/`)) {
          req.url = url.replace(`${BASE}demo-dashboard-config/`, `${BASE}demo-synthetic/dashboard-config/`) + query
        } else if (url.startsWith(`${BASE}demo-scenarios/`)) {
          const rel = url.slice(`${BASE}demo-scenarios/`.length)
          if (existsSync(resolve(root, 'public/demo-synthetic/scenarios', rel))) req.url = `${BASE}demo-synthetic/scenarios/${rel}${query}`
        }
        next()
      })
    },
  }
}
