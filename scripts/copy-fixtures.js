// Copies tests/fixtures/{observed,scenarios,dashboard-config} into public/
// for a manual `npm run dev` check — the same copy tests/global-setup.js
// does automatically before a Playwright run, and tests/global-teardown.js
// undoes automatically after one. That teardown is exactly the friction
// this script exists to route around: running `npm run test:integration`
// wipes a manual check's data out from under it with no separate way to
// put it back. Run tests/fixtures/generate.py yourself first if the
// Parquet fixtures don't exist yet or need regenerating — this script only
// copies what's already on disk under tests/fixtures/, it doesn't generate
// anything.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const copies = [
  ['tests/fixtures/observed', 'public/observed'],
  ['tests/fixtures/scenarios', 'public/scenarios'],
  ['tests/fixtures/dashboard-config', 'public/dashboard-config'],
]

for (const [src, dest] of copies) {
  const srcPath = join(repoRoot, src)
  const destPath = join(repoRoot, dest)
  if (!existsSync(srcPath)) {
    console.error(
      `[copy-fixtures] Missing ${srcPath} — run "uv run python tests/fixtures/generate.py" first.`,
    )
    process.exit(1)
  }
  // Remove any existing copy first — cpSync merges into an existing
  // directory rather than replacing it, which is usually fine, but a
  // clean copy avoids stale leftovers from a previous fixture shape.
  if (existsSync(destPath)) rmSync(destPath, { recursive: true, force: true })
  cpSync(srcPath, destPath, { recursive: true })
  console.log(`[copy-fixtures] ${src} -> ${dest}`)
}

console.log('[copy-fixtures] Done. Run "npm run dev" to check against this data.')
