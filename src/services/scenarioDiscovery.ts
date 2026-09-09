// Registers public/observed/ and public/scenarios/* at startup, and (step 3,
// added by User Story 3) applies ?s= URL params. See
// specs/001-data-state-layer/contracts/scenario-discovery.md.
// 026-activitysim-demo-content: also registers public/demo-scenarios/* —
// the new, git-tracked real-content root, additive alongside (not a
// replacement for) the paths above. See
// specs/026-activitysim-demo-content/contracts/discovery.md.
import { registerFileURL } from './duckdb.ts'
import { loadManifest } from './yamlLoader.ts'
import { manifestFromObject, type ParsedManifest } from '../scenario/manifestReader.ts'
import * as appState from '../state/appState.ts'

const base = import.meta.env.BASE_URL

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetchJSON: ${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * 035-scenario-label-color: a REAL, confirmed, pre-existing gap found
 * while wiring up FR-007 (manifest color as each scenario's real default)
 * — this whole file never read manifest.yaml at all, for ANY of its three
 * registration paths, despite every one of those real directories
 * (public/observed/, public/scenarios/{name}/, public/demo-scenarios/{name}/)
 * genuinely having a manifest.yaml with a real `color` (confirmed directly
 * against tests/fixtures/observed/manifest.yaml and .../good_scenario/
 * manifest.yaml). Only scenario/scenarioManager.ts's own SEPARATE,
 * local-folder-loading path ever read `manifest?.color` into
 * appState.register() — so `Scenario.color` has been populated for local
 * folders only, never for any of the three discovery paths this file
 * owns, since 025-python-postprocessor first introduced the field.
 * services/yamlLoader.ts's own loadManifest() already existed for exactly
 * this (a fetch-based manifest.yaml reader) with zero callers until now.
 * Fail-soft, matching every other registration step in this file — a
 * missing/malformed manifest.yaml yields an empty ParsedManifest, never a
 * thrown error or a blocked registration (color/runDate/notes simply stay
 * undefined, the same as before this fix for every scenario that has no
 * manifest.yaml color at all).
 */
async function fetchScenarioManifest(manifestUrl: string): Promise<Partial<ParsedManifest>> {
  try {
    const { raw } = await loadManifest(manifestUrl)
    if (typeof raw !== 'object' || raw === null) return {}
    return manifestFromObject(raw as Record<string, unknown>)
  } catch {
    return {}
  }
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
  // 035-scenario-label-color: manifest.yaml sits at the scenario ROOT
  // (public/observed/manifest.yaml), one level up from `folderUrl` (its
  // own summary/ subdirectory) — fetched before register() so `color` is
  // present from this scenario's very first appState entry, not applied
  // as a later patch.
  const manifest = await fetchScenarioManifest(`${base}observed/manifest.yaml`)
  // Register in appState first (source-of-truth entry exists regardless of
  // what happens next), then attempt the actual data registration.
  // 020-settings-modal: `path` is the real folder URL this scenario's
  // data is fetched from (research.md §5) — already computed above as
  // `folderUrl`, reused below rather than a second registerSummaryFolder()
  // call.
  appState.register('observed', {
    pinned: true,
    source: 'url',
    path: folderUrl,
    color: manifest.color,
    runDate: manifest.runDate,
    notes: manifest.notes,
  })
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
    // 035-scenario-label-color: see fetchScenarioManifest()'s own header
    // comment — manifest.yaml sits at `{base}scenarios/{name}/manifest.yaml`,
    // one level up from `folderUrl`.
    const manifest = await fetchScenarioManifest(`${base}scenarios/${name}/manifest.yaml`)
    appState.register(name, {
      source: 'url',
      path: folderUrl,
      color: manifest.color,
      runDate: manifest.runDate,
      notes: manifest.notes,
    })
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
 * 026-activitysim-demo-content: registers every scenario listed in
 * public/demo-scenarios/index.json — structurally identical to
 * registerPublishedScenarios() above (same fail-soft-per-scenario and
 * fail-soft-on-missing-index.json behavior), pointed at the new,
 * git-tracked demo-scenarios/ content root instead. A deliberate sibling
 * function rather than a parameterized registerPublishedScenarios(), so
 * that function's own existing behavior/tests stay completely untouched
 * (spec.md FR-010).
 */
async function registerDemoScenarios(): Promise<void> {
  let names: string[]
  try {
    names = await fetchJSON<string[]>(`${base}demo-scenarios/index.json`)
  } catch {
    // No public/demo-scenarios/index.json — this feature's content hasn't
    // been generated/published yet. Not a failure of discoverScenarios()
    // as a whole, mirroring registerPublishedScenarios()'s own handling.
    return
  }

  for (const name of names) {
    const folderUrl = `${base}demo-scenarios/${name}/summary`
    // 035-scenario-label-color: manifest.yaml sits at
    // `{base}demo-scenarios/{name}/manifest.yaml`, same reasoning as the
    // two registration paths above.
    const manifest = await fetchScenarioManifest(`${base}demo-scenarios/${name}/manifest.yaml`)
    appState.register(name, {
      source: 'url',
      path: folderUrl,
      color: manifest.color,
      runDate: manifest.runDate,
      notes: manifest.notes,
    })
    try {
      await registerSummaryFolder(folderUrl, name)
      appState.setStatus(name, 'ready')
    } catch (err) {
      console.warn(`scenarioDiscovery: failed to register demo scenario "${name}"`, err)
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
  await registerDemoScenarios()
  applyURLParams()
}
