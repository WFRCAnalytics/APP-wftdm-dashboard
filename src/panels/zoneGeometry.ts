// 013-zonemap-panel: loads and caches `boundaries` zone geometry.
// Pure/DOM-free aside from the DuckDB-WASM calls it makes. See
// contracts/zonemap-panel.md and research.md §2/§3/§4/§11.
//
// registerFileURL() (never registerFileBuffer()) + the resulting view's
// own plain read_parquet() (never ST_Read()) — research.md §3's own
// confirmed finding: ST_Read() fails against registerFileBuffer()-
// registered files (duckdb/duckdb-wasm#1791, "IO Error: Unknown file
// type"), while an HTTP(S)-URL-registered file works. `boundaries` is a
// scenario-independent, published static asset (public/geometry/,
// data-model.md), never something a local scenario folder supplies, so
// this path was never going to touch registerFileBuffer() in the first
// place — this isn't a defensive workaround, it's the natural shape.
import { query, registerFileURL } from '@/services/duckdb'

const base = import.meta.env.BASE_URL

export interface ZoneFeature {
  zoneId: string
  geometry: GeoJSON.Geometry
}

export interface ZoneGeometry {
  boundaries: string
  features: ZoneFeature[]
}

/** Resolves a bare `boundaries` filename to its published URL under
 * public/geometry/ (data-model.md) — the same import.meta.env.BASE_URL
 * convention services/scenarioDiscovery.ts already uses for
 * public/observed/public/scenarios. */
export function resolveGeometryUrl(boundaries: string): string {
  return `${base}geometry/${boundaries}`
}

/** 031-all-panel-demo-content: the real, permanent, git-tracked sibling
 * root for this feature's own real MTC-sourced geometry
 * (public/demo-geometry/, scripts/build-demo-zone-geometry.py) — kept
 * entirely separate from resolveGeometryUrl()'s own gitignored,
 * fixture-managed public/geometry/ path (026-activitysim-demo-content's
 * own public/demo-scenarios/ precedent, applied here to geometry — see
 * specs/031-all-panel-demo-content/research.md's own Research Findings
 * and contracts/geometry-pipeline.md). Only ever consulted as a fallback
 * (loadZoneGeometry() below) — resolveGeometryUrl() itself, and every
 * existing fixture/production boundaries file under public/geometry/,
 * are completely unaffected. */
export function resolveDemoGeometryUrl(boundaries: string): string {
  return `${base}demo-geometry/${boundaries}`
}

let spatialExtensionPromise: Promise<void> | null = null

/** Runs INSTALL spatial; LOAD spatial; at most once for the life of the
 * page (module-level idempotent promise, same shape services/duckdb.ts's
 * own initDuckDB() already uses) — research.md §2: the spatial extension
 * is not bundled/autoloaded, unlike parquet/json/icu/autocomplete, so
 * this is a real, confirmed one-time network fetch (extensions.duckdb.org),
 * not a no-op. Two separate statements (not one compound string) —
 * matching every other multi-step call in this codebase's own
 * one-statement-per-query() convention (services/duckdb.ts's
 * createViewOverParquet, for example). */
export function ensureSpatialExtensionLoaded(): Promise<void> {
  if (!spatialExtensionPromise) {
    spatialExtensionPromise = (async () => {
      await query('INSTALL spatial')
      await query('LOAD spatial')
    })()
  }
  return spatialExtensionPromise
}

interface CacheEntry {
  boundariesId: string
  promise: Promise<ZoneGeometry>
}

// Module-level, no eviction — research.md §4's own explicit, reasoned
// decision (a deliberate accepted tradeoff: boundaries files are
// expected to be few and small across a typical dashboard deployment),
// not an oversight.
const cache = new Map<string, CacheEntry>()

/**
 * Loads and caches `boundaries` geometry (contracts/zonemap-panel.md).
 * `boundariesId` names the geometry's own zone-id column
 * (config.boundaries_id) — required, not optional, because the query
 * this builds must select it.
 *
 * A repeat call sharing both `boundaries` AND `boundariesId` returns the
 * exact same pending/resolved promise (no second registerFileURL()/
 * query()). A repeat call for the same `boundaries` with a DIFFERENT
 * `boundariesId` is a real, reachable config-authoring mismatch
 * (research.md §11) — rejected SYNCHRONOUSLY, before any network
 * activity, WITHOUT touching the existing cache entry: every other panel
 * already sharing that entry keeps working unaffected.
 */
export function loadZoneGeometry(boundaries: string, boundariesId: string): Promise<ZoneGeometry> {
  const existing = cache.get(boundaries)
  if (existing) {
    if (existing.boundariesId === boundariesId) return existing.promise
    return Promise.reject(
      new Error(
        `loadZoneGeometry: "${boundaries}" was already loaded with boundaries_id ` +
          `"${existing.boundariesId}", but this call configured boundaries_id ` +
          `"${boundariesId}". All panels referencing the same boundaries file must ` +
          'use the same boundaries_id.',
      ),
    )
  }

  const promise = (async (): Promise<ZoneGeometry> => {
    await ensureSpatialExtensionLoaded()
    const viewName = `zonemap-geom__${boundaries}`
    // registerFileURL() already creates a view named `viewName` wrapping
    // read_parquet(url) (services/duckdb.ts's own createViewOverParquet)
    // — queried here directly, never via a second explicit
    // read_parquet()/ST_Read() call of this module's own. This is also
    // the real call that THROWS for an unreachable URL (services/
    // duckdb.ts's own documented behavior — the actual HTTP request
    // only happens once read_parquet() needs the file's footer, inside
    // this call), which is what the fallback below depends on.
    //
    // 031-all-panel-demo-content: try the default public/geometry/ path
    // first (unchanged for every existing fixture/production boundaries
    // file — this is the ONLY attempt those ever make); only on failure,
    // retry once against public/demo-geometry/ (resolveDemoGeometryUrl())
    // before giving up.
    //
    // A DIFFERENT view name for the retry — confirmed live, NOT a safe
    // reuse as an earlier draft of this comment assumed: DuckDB-WASM's
    // own db.registerFileURL() registers the virtual filename -> URL
    // mapping FIRST, entirely separately from (and before) the
    // view-creation query below that actually fails for a bad URL — so
    // even though CREATE OR REPLACE VIEW's own query throws, the raw
    // filename registration from the first attempt has ALREADY
    // succeeded and persists. Retrying registerFileURL() with the SAME
    // view name therefore hits a real, confirmed "File already
    // registered" error from DuckDB-WASM's own API, not a clean retry.
    let activeViewName = viewName
    try {
      await registerFileURL(viewName, resolveGeometryUrl(boundaries))
    } catch {
      activeViewName = `zonemap-geom-demo__${boundaries}`
      await registerFileURL(activeViewName, resolveDemoGeometryUrl(boundaries))
    }
    const rows = await query(
      `SELECT "${boundariesId}" AS zone_id, ST_AsGeoJSON(ST_GeomFromWKB(geometry)) AS geojson FROM "${activeViewName}"`,
    )
    const features: ZoneFeature[] = rows.map((row) => ({
      zoneId: String(row.zone_id),
      geometry: JSON.parse(row.geojson as string) as GeoJSON.Geometry,
    }))
    return { boundaries, features }
  })()

  cache.set(boundaries, { boundariesId, promise })
  return promise
}
