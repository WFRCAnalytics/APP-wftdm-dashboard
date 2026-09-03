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
    // read_parquet()/ST_Read() call of this module's own.
    await registerFileURL(viewName, resolveGeometryUrl(boundaries))
    const rows = await query(
      `SELECT "${boundariesId}" AS zone_id, ST_AsGeoJSON(ST_GeomFromWKB(geometry)) AS geojson FROM "${viewName}"`,
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
