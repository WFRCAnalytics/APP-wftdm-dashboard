// Removes the fixture copies made by tests/global-setup.js so they never
// linger in the production public/ tree between runs.
import { rmSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const dirs = [
  'public/observed',
  'public/scenarios',
  'public/all-placeholders-config.yaml',
  'public/dashboard-config',
  'public/geometry',
]

// 026-activitysim-demo-content: restores the two demo index.json files
// global-setup.js's own matching block blanked to `[]` — see that file's
// comment for the full reason (a directory-rename approach was tried
// first and found to fail intermittently with a real, repeated Windows
// EPERM even with retries; overwriting two small files avoids that
// fragility entirely).
const demoIndexFiles = [
  'public/demo-scenarios/index.json',
  'public/demo-dashboard-config/index.json',
]
const savedSuffix = '.original-during-tests'

export default async function globalTeardown() {
  for (const dir of dirs) {
    const p = join(repoRoot, dir)
    if (existsSync(p)) rmSync(p, { recursive: true, force: true })
  }

  for (const file of demoIndexFiles) {
    const live = join(repoRoot, file)
    const saved = live + savedSuffix
    if (existsSync(saved)) {
      writeFileSync(live, readFileSync(saved))
      unlinkSync(saved)
    }
  }
}
