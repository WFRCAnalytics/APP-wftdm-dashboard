// Copies generated test fixtures into public/ before the Playwright run,
// so the app boots against real (tiny, synthetic) Parquet data without ever
// committing fixture binaries to the production public/ tree. Paired with
// tests/global-teardown.js. Regenerate fixtures first via:
//   uv run python tests/fixtures/generate.py
import { cpSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const copies = [
  ['tests/fixtures/observed', 'public/observed'],
  ['tests/fixtures/scenarios', 'public/scenarios'],
  ['tests/fixtures/all-placeholders-config.yaml', 'public/all-placeholders-config.yaml'],
  // 003-dashboard-shell-navigation: real dashboard-*.yaml fixtures +
  // index.json, discovered by loadDashboards() the same way
  // public/scenarios/index.json is discovered for scenarios.
  ['tests/fixtures/dashboard-config', 'public/dashboard-config'],
]

export default async function globalSetup() {
  for (const [src, dest] of copies) {
    const srcPath = join(repoRoot, src)
    if (!existsSync(srcPath)) {
      throw new Error(
        `[global-setup] Missing fixture directory: ${srcPath}. ` +
          `Run "uv run python tests/fixtures/generate.py" first.`,
      )
    }
    cpSync(srcPath, join(repoRoot, dest), { recursive: true })
  }
}
