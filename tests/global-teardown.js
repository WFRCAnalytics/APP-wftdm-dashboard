// Removes the fixture copies made by tests/global-setup.js so they never
// linger in the production public/ tree between runs.
import { rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const dirs = [
  'public/observed',
  'public/scenarios',
  'public/all-placeholders-config.yaml',
  'public/dashboard-config',
]

export default async function globalTeardown() {
  for (const dir of dirs) {
    const p = join(repoRoot, dir)
    if (existsSync(p)) rmSync(p, { recursive: true, force: true })
  }
}
