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
 *
 * 042-boot-performance-fix: the per-file loop was previously sequential
 * (`for (...) { await registerFileURL(...) }`), the single dominant
 * bottleneck confirmed by the 042 investigation (docs/PIPELINE.md) — 105
 * real Parquet files across 3 demo scenarios registered one at a time,
 * ~20-25ms of pure per-request latency each even on a fast/low-latency
 * connection, ~2.4-2.6s of the ~5-12s total boot time.
 *
 * Confirmed there is NO real ordering dependency between files within one
 * scenario's summary folder before parallelizing: each file gets its own
 * globally-unique view name (`{namePrefix}__{stem}`, confirmed unique
 * because `namePrefix` is always a distinct scenario name and `stem` a
 * distinct filename), so registerFileURL()'s two real effects —
 * duckdb.ts's `db.registerFileURL()` (a virtual filename->URL mapping,
 * DB-level, not connection-level) and `createViewOverParquet()`'s own
 * `CREATE OR REPLACE VIEW "{viewName}" ...` query against the ONE shared
 * connection — never touch another file's view. Empirically verified,
 * not just reasoned about: a live test against the real, running
 * DuckDB-WASM connection (12 real demo Parquet files registered and
 * queried via Promise.all vs. the same 12 registered sequentially)
 * produced byte-identical row counts with zero errors, confirming the
 * shared AsyncDuckDBConnection safely queues/serializes concurrent
 * same-connection query calls internally rather than corrupting or
 * rejecting them.
 */
async function registerSummaryFolder(folderUrl: string, namePrefix: string): Promise<void> {
  const filenames = await fetchJSON<string[]>(`${folderUrl}/index.json`)
  await Promise.all(
    filenames.map((fileName) => {
      const stem = fileName.replace(/\.parquet$/, '')
      return registerFileURL(`${namePrefix}__${stem}`, `${folderUrl}/${fileName}`)
    }),
  )
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
    // 038-all-loaded-scenarios: a scenario participates in the dynamic
    // `$scenario` union iff its own data is genuinely present. The only
    // condition is `status === 'ready'` — no fixture-vs-demo branching
    // (FR-013). An empty `public/observed/` in a real deployment reaches
    // the catch below (status 'failed') and is never activated, so it no
    // longer poisons an unpinned union. Was previously an unconditional
    // `setActive('observed', true)` after the try/catch; see
    // specs/038-all-loaded-scenarios/contracts/discovery-activation.md.
    appState.setActive('observed', true)
  } catch (err) {
    // Distinct, more severe warning than a published-scenario failure —
    // observed data is supposed to always be available (research.md §5).
    console.warn('scenarioDiscovery: observed dataset registration failed', err)
    appState.setStatus('observed', 'failed')
  }
}

/**
 * 042-boot-performance-fix: TWO-PHASE registration, replacing the
 * previous single `for (const name of names) { await ...everything... }`
 * loop that processed one scenario fully (manifest fetch + ~35 file
 * registrations) before ever starting the next.
 *
 * Confirmed, before restructuring, that a REAL ordering dependency exists
 * here — unlike the per-file case inside registerSummaryFolder() above,
 * this one is real and must be preserved: appState.register()'s own
 * `order: nextOrder++` field (state/appState.ts) is assigned purely by
 * CALL SEQUENCE, and getBaseline()'s automatic-default fallback resolves
 * to "the earliest-REGISTERED (Map insertion order) scenario with
 * pinned === false && status === 'ready'" — both documented, deliberate
 * invariants this app relies on for deterministic default display order
 * and deterministic automatic baseline selection. If every scenario's
 * manifest-fetch-then-register() sequence ran fully concurrently
 * (Promise.all over the whole per-scenario body), the actual register()
 * CALL order — and therefore both of those invariants — would become a
 * real network-timing race between scenarios, silently non-deterministic
 * across page loads.
 *
 * Phase 1 (register(), sequential, cheap) fixes that: manifest fetches
 * are one small YAML request each — not the confirmed bottleneck — so
 * keeping them sequential costs a few tens of ms total while guaranteeing
 * every appState.register() call happens strictly in `names`' own listed
 * (index.json) order, exactly as before this fix.
 *
 * Phase 2 (the real bottleneck, fully parallel) is safe to parallelize
 * across scenarios: registerSummaryFolder()/setStatus()/setActive() for
 * one scenario never read or depend on another scenario's state — each
 * only ever looks up its OWN name in appState's Map (already registered
 * in Phase 1) and mutates only that entry.
 */
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

  // Phase 1: establish every scenario's appState entry (and its `order`)
  // synchronously, in listed order.
  const folderUrls = new Map<string, string>()
  for (const name of names) {
    // 020-settings-modal: `path` is the real folder URL (research.md §5).
    const folderUrl = `${base}scenarios/${name}/summary`
    folderUrls.set(name, folderUrl)
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
  }

  // Phase 2: load every scenario's actual Parquet files in parallel.
  await Promise.all(
    names.map(async (name) => {
      const folderUrl = folderUrls.get(name)!
      try {
        await registerSummaryFolder(folderUrl, name)
        appState.setStatus(name, 'ready')
        // 038-all-loaded-scenarios: every published scenario whose data
        // actually loaded participates by default (status === 'ready'
        // only, no context branching — FR-013). A viewer excludes one via
        // the Scenarios-tab Switch. See
        // specs/038-all-loaded-scenarios/contracts/discovery-activation.md.
        appState.setActive(name, true)
      } catch (err) {
        console.warn(`scenarioDiscovery: failed to register scenario "${name}"`, err)
        appState.setStatus(name, 'failed')
      }
    }),
  )
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
/**
 * 042-boot-performance-fix: same two-phase restructuring as
 * registerPublishedScenarios() above, same reason — see that function's
 * own header comment for the full ordering-dependency analysis (identical
 * here: appState.register()'s `order` field and getBaseline()'s
 * automatic-default tie-break both depend on register() calls happening
 * in `names`' listed order, which Phase 1 preserves by staying
 * sequential; Phase 2, the real bottleneck, is safe to fully parallelize
 * since registerSummaryFolder()/setStatus()/setActive() for one demo
 * scenario never touch another's state). This is the group most affected
 * in absolute terms — 3 real demo scenarios × ~35 files each — since the
 * old code processed all three fully sequentially, scenario by scenario,
 * on top of the per-file sequential loop inside registerSummaryFolder().
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

  // Phase 1: establish every scenario's appState entry (and its `order`)
  // synchronously, in listed order.
  const folderUrls = new Map<string, string>()
  for (const name of names) {
    const folderUrl = `${base}demo-scenarios/${name}/summary`
    folderUrls.set(name, folderUrl)
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
  }

  // Phase 2: load every scenario's actual Parquet files in parallel.
  await Promise.all(
    names.map(async (name) => {
      const folderUrl = folderUrls.get(name)!
      try {
        await registerSummaryFolder(folderUrl, name)
        appState.setStatus(name, 'ready')
        // 038-all-loaded-scenarios: same rule as registerPublishedScenarios()
        // above — a demo scenario whose data loaded participates by default
        // (status === 'ready' only). This is what makes the real demo read
        // as a multi-scenario comparison without any `?s=` param, and what
        // gives the Scenarios-tab Switch real universal control. See
        // specs/038-all-loaded-scenarios/contracts/discovery-activation.md.
        appState.setActive(name, true)
      } catch (err) {
        console.warn(`scenarioDiscovery: failed to register demo scenario "${name}"`, err)
        appState.setStatus(name, 'failed')
      }
    }),
  )
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
 *
 * 042-boot-performance-fix: the three group calls below are DELIBERATELY
 * still sequential (`await` each, not Promise.all) — a real ordering
 * dependency was confirmed here, unlike the per-file case inside
 * registerSummaryFolder() and the per-scenario-within-a-group case in
 * registerPublishedScenarios()/registerDemoScenarios() (both parallelized
 * above; see their own header comments). appState.register()'s `order`
 * field is assigned purely by call sequence, and getBaseline()'s
 * automatic-default fallback resolves to "the earliest-REGISTERED
 * scenario with pinned === false && status === 'ready'" — both rely on
 * observed registering before any published/demo scenario, and published
 * scenarios registering before demo scenarios, exactly as this app's own
 * documented history records (state/appState.ts's getBaseline() comment).
 * Running all three groups' register() calls concurrently would make that
 * relative order a genuine network-timing race, silently non-deterministic
 * across page loads — a real regression this fix must not introduce.
 *
 * This is NOT the confirmed dominant bottleneck, though, so leaving it
 * sequential costs little: the 042 investigation's real, measured cost was
 * the 105 sequential FILE registrations (~2.4-2.6s serialized even on a
 * fast connection), not the 3 group-level `await` transitions between
 * registerObserved()/registerPublishedScenarios()/registerDemoScenarios()
 * — each of which now completes in roughly the time of its OWN slowest
 * single file/request (Phase 2 inside each is fully parallel), not the
 * sum of all its files' latencies. Serializing 3 already-fast group calls
 * to fully preserve a real, documented invariant is a good trade; a finer-
 * grained overlap (e.g. starting group 2's cheap Phase 1 while group 1's
 * Phase 2 is still loading files) was considered and rejected as added
 * complexity for a cost that's no longer the dominant one.
 */
export async function discoverScenarios(): Promise<void> {
  await registerObserved()
  await registerPublishedScenarios()
  await registerDemoScenarios()
  applyURLParams()
}
