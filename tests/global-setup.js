// Prepares public/ for the Playwright run. Paired with
// tests/global-teardown.js. Runs ONCE, before any worker.
//
// 040-test-suite-migration: the synthetic-fixture copy-in dance is gone.
// The suite tests against the real, git-tracked
// public/demo-dashboard-config/ (8 tabs — the 7 calibration tabs plus the
// permanent dashboard-8-test.yaml broken-panel tab) and
// public/demo-scenarios/ (3 ActivitySim runs) content directly. The only
// remaining job is to copy the one hand-maintained config-grammar fixture
// (all-placeholders-config.yaml) to where boot.spec.ts fetches it.
//
// No index.json manipulation: dashboard-8-test.yaml is a permanent real
// entry in public/demo-dashboard-config/index.json now, not a test-only
// injection.
import { cpSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

// The single surviving fixture copy — a standalone config-grammar
// artifact (mappings/bins/sql_fragments/$inputs/$scenario/$filters),
// not a rendered dashboard tab. Only consumer: boot.spec.ts's
// yamlLoader.loadConfig('/APP-wftdm-dashboard/all-placeholders-config.yaml').
const copies = [
  ['tests/fixtures/all-placeholders-config.yaml', 'public/all-placeholders-config.yaml'],
]

export default async function globalSetup() {
  for (const [src, dest] of copies) {
    const srcPath = join(repoRoot, src)
    if (!existsSync(srcPath)) {
      throw new Error(`[global-setup] Missing fixture: ${srcPath}`)
    }
    cpSync(srcPath, join(repoRoot, dest), { recursive: true })
  }
}
