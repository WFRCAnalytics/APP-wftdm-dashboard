// Geometry the zone-map kinds draw: the TAZ polygons (reusing panels/zoneGeometry.ts, which loads GeoParquet through
// ST_GeomFromWKB()/ST_AsGeoJSON(), never ST_Read()) and the rail line + stations (public/demo-geometry/*.geoparquet,
// columns kind line|station, name, WKB geometry). Loaded once per page and cached.
import { computeGeometryBounds, type BoundsTuple } from '@/panels/mapBounds'
import { ensureSpatialExtensionLoaded, loadZoneGeometry, resolveDemoGeometryUrl } from '@/panels/zoneGeometry'
import { query, registerFileURL } from '@/services/duckdb'

export const DEFAULT_ZONES_FILE = 'wasatch-zones.geoparquet'
export const DEFAULT_RAIL_FILE = 'wasatch-rail.geoparquet'
export const ZONE_ID_COLUMN = 'taz_id'

export interface RailFeatures {
  lines: GeoJSON.Feature[]
  stations: GeoJSON.Feature[]
}

export interface MapGeometry {
  /** One feature per zone: `id` is the numeric TAZ id, `properties.id` the same number. Geometry only. */
  zones: GeoJSON.Feature[]
  rail: RailFeatures
  bounds: BoundsTuple | null
}

const cache = new Map<string, Promise<MapGeometry>>()
const railCache = new Map<string, Promise<RailFeatures>>()

async function loadRail(file: string | null): Promise<RailFeatures> {
  if (!file) return { lines: [], stations: [] }
  let p = railCache.get(file)
  if (!p) {
    p = (async () => {
      await ensureSpatialExtensionLoaded()
      const view = `mapgeom-rail__${file}`
      await registerFileURL(view, resolveDemoGeometryUrl(file))
      const rows = await query(`SELECT kind, name, ST_AsGeoJSON(ST_GeomFromWKB(geometry)) AS geojson FROM "${view}"`)
      const lines: GeoJSON.Feature[] = []
      const stations: GeoJSON.Feature[] = []
      for (const r of rows) {
        const feature: GeoJSON.Feature = {
          type: 'Feature',
          properties: { kind: String(r.kind), name: String(r.name ?? '') },
          geometry: JSON.parse(r.geojson as string) as GeoJSON.Geometry,
        }
        ;(r.kind === 'station' ? stations : lines).push(feature)
      }
      return { lines, stations }
    })()
    p.catch(() => railCache.delete(file))
    railCache.set(file, p)
  }
  return p
}

/** Zones plus rail. A missing rail file is not an error (the line is decoration); missing zones are. */
export function loadMapGeometry(zonesFile: string = DEFAULT_ZONES_FILE, railFile: string | null = DEFAULT_RAIL_FILE): Promise<MapGeometry> {
  const key = `${zonesFile}|${railFile ?? ''}`
  let p = cache.get(key)
  if (!p) {
    p = (async () => {
      const [geom, rail] = await Promise.all([
        loadZoneGeometry(zonesFile, ZONE_ID_COLUMN),
        loadRail(railFile).catch((err) => {
          console.warn('zone map: rail geometry unavailable', err)
          return { lines: [], stations: [] } as RailFeatures
        }),
      ])
      const zones: GeoJSON.Feature[] = geom.features.map((f) => ({
        type: 'Feature',
        id: Number(f.zoneId),
        properties: { id: Number(f.zoneId) },
        geometry: f.geometry,
      }))
      return { zones, rail, bounds: computeGeometryBounds(geom.features) }
    })()
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}
