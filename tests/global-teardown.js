// Undoes tests/global-setup.js. Runs ONCE, after all workers exit.
//
// 040-test-suite-migration: no fixture directories are created any more,
// and no index.json is manipulated (dashboard-8-test.yaml is a permanent
// real entry). The only thing to undo is the copied
// public/all-placeholders-config.yaml.
import { rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const copiedFile = 'public/all-placeholders-config.yaml'

export default async function globalTeardown() {
  const copied = join(repoRoot, copiedFile)
  if (existsSync(copied)) rmSync(copied, { force: true })
}
