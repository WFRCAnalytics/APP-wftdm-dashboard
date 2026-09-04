// Registers public/observed/ and public/scenarios/* at startup, and (step 3,
// added by User Story 3) applies ?s= URL params. See
// specs/001-data-state-layer/contracts/scenario-discovery.md.
import { registerFileURL } from './duckdb.ts'
import * as appState from '../state/appState.ts'

const base = import.meta.env.BASE_URL

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetchJSON: ${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * Registers every filename listed in `{folderUrl}/index.json` as a view
 * named `{namePrefix}__{fileStem}`.
 * @param folderUrl e.g. `${base}observed/summary`
 * @param namePrefix e.g. 'observed'
 */
async function registerSummaryFolder(folderUrl: string, namePrefix: string): Promise<void> {
  const filenames = await fetchJSON<string[]>(`${folderUrl}/index.json`)
  for (const fileName of filenames) {
    const stem = fileName.replace(/\.parquet$/, '')
    await registerFileURL(`${namePrefix}__${stem}`, `${folderUrl}/${fileName}`)
  }
}

async function registerObserved(): Promise<void> {
  const folderUrl = `${base}observed/summary`
  // Register in appState first (source-of-truth entry exists regardless of
  // what happens next), then attempt the actual data registration.
  // 020-settings-modal: `path` is the real folder URL this scenario's
  // data is fetched from (research.md §5) — already computed above as
  // `folderUrl`, reused below rather than a second registerSummaryFolder()
  // call.
  appState.register('observed', { pinned: true, source: 'url', path: folderUrl })
  try {
    await registerSummaryFolder(folderUrl, 'observed')
    appState.setStatus('observed', 'ready')
  } catch (err) {
    // Distinct, more severe warning than a published-scenario failure —
    // observed data is supposed to always be available (research.md §5).
    console.warn('scenarioDiscovery: observed dataset registration failed', err)
    appState.setStatus('observed', 'failed')
  }
  // FR-009: observed is marked active regardless of what happened above.
  appState.setActive('observed', true)
}

async function registerPublishedScenarios(): Promise<void> {
  let names: string[]
  try {
    names = await fetchJSON<string[]>(`${base}scenarios/index.json`)
  } catch {
    // No public/scenarios/index.json at all — nothing published yet. Not a
    // failure of discoverScenarios() as a whole (mirrors loadDashboards()'s
    // empty-index handling in yamlLoader.ts).
    return
  }

  for (const name of names) {
    // 020-settings-modal: `path` is the real folder URL (research.md §5).
    const folderUrl = `${base}scenarios/${name}/summary`
    appState.register(name, { source: 'url', path: folderUrl })
    try {
      await registerSummaryFolder(folderUrl, name)
      appState.setStatus(name, 'ready')
    } catch (err) {
      console.warn(`scenarioDiscovery: failed to register scenario "${name}"`, err)
      appState.setStatus(name, 'failed')
    }
  }
}

/**
 * Reads repeated `s` params from the page URL (`?s=observed&s=abm_2026`) and
 * marks each matching, already-registered scenario active. Any value
 * matching nothing is ignored, never thrown. Duplicate values collapse to a
 * single activation (Set semantics).
 */
function applyURLParams(): void {
  const params = new URLSearchParams(location.search)
  const requested = new Set(params.getAll('s'))
  for (const name of requested) {
    if (appState.get(name)) {
      appState.setActive(name, true)
    }
  }
}

/**
 * Run once during boot, after initDuckDB() resolves. Registers observed/
 * and every published scenario (fail-soft per scenario, FR-012), then
 * applies ?s= URL params (FR-011).
 */
export async function discoverScenarios(): Promise<void> {
  await registerObserved()
  await registerPublishedScenarios()
  applyURLParams()
}
