// Copies generated test fixtures into public/ before the Playwright run,
// so the app boots against real (tiny, synthetic) Parquet data without ever
// committing fixture binaries to the production public/ tree. Paired with
// tests/global-teardown.js. Regenerate fixtures first via:
//   uv run python tests/fixtures/generate.py
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
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
  // 013-zonemap-panel: the zone-boundary GeoParquet fixture, fetched by
  // registerFileURL() at a stable public/geometry/ URL (data-model.md).
  ['tests/fixtures/geometry', 'public/geometry'],
]

// 026-activitysim-demo-content: unlike every path above, public/demo-scenarios/
// and public/demo-dashboard-config/ are real, git-tracked content — always
// present on disk, not swapped in only for a test run. Since this suite's
// own webServer (playwright.config.js) serves the raw public/ tree directly,
// leaving it registerable would add 3 extra scenarios and 3 extra dashboard
// tabs to every test run, breaking every assertion that counts or names
// scenarios/tabs exactly (a real, confirmed regression found via this
// feature's own full-suite run, not assumed).
//
// Renaming the whole directory tree out of the way was tried first and
// rejected: real, repeated `EPERM: operation not permitted` failures on
// Windows even with a retry-with-backoff wrapper (likely Defender/Search
// Indexer holding a transient handle somewhere inside a tree of dozens of
// just-written files — a `mv` from a plain shell moments later always
// succeeded, but the exact same rename from Node's globalSetup did not,
// repeatedly). `registerDemoScenarios()`/`loadDashboards()` are both driven
// entirely by their own `index.json` content, so blanking just those two
// small files to `[]` — a single small write, not a directory-tree
// operation — produces the identical "nothing to discover" effect with
// none of the directory-rename fragility. Original content is restored
// verbatim by global-teardown.js.
const demoIndexFiles = [
  'public/demo-scenarios/index.json',
  'public/demo-dashboard-config/index.json',
]
const savedSuffix = '.original-during-tests'

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

  for (const file of demoIndexFiles) {
    const live = join(repoRoot, file)
    const saved = live + savedSuffix
    if (existsSync(saved)) {
      // A previous run's global-teardown never fired (e.g. a crashed/killed
      // run) — the saved copy is the real original; don't overwrite it.
      // Left for a developer to resolve manually, same fail-loud spirit as
      // the missing-fixture check above.
      throw new Error(
        `[global-setup] ${saved} already exists — a previous test run's ` +
          `teardown didn't restore it. Resolve manually before re-running ` +
          `(likely: copy it back over ${live}).`,
      )
    }
    if (existsSync(live)) {
      writeFileSync(saved, readFileSync(live))
      writeFileSync(live, '[]\n')
    }
  }
}
