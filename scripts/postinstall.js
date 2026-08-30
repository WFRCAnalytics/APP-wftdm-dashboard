// Copies the coi-serviceworker.js asset from its npm package into public/,
// where index.html loads it first (per CLAUDE.md). Must run after every
// `npm install` since public/ is not committed with node_modules copies.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const src = join(repoRoot, 'node_modules', 'coi-serviceworker', 'coi-serviceworker.js')
const destDir = join(repoRoot, 'public')
const dest = join(destDir, 'coi-serviceworker.js')

if (!existsSync(src)) {
  console.warn(`[postinstall] coi-serviceworker.js not found at ${src} — skipping copy.`)
  process.exit(0)
}

mkdirSync(destDir, { recursive: true })
copyFileSync(src, dest)
console.log(`[postinstall] Copied coi-serviceworker.js -> ${dest}`)
