// 027-map-auto-fit-and-reset: pure, DOM-free bounds computation — mirrors
// flowmapData.ts's/zonemapColor.ts's own "pure transform + DOM-touching
// caller" split (research.md §5). Deliberately has no `maplibre-gl` import
// at all: a BoundsTuple is already a valid MapLibre `LngLatBoundsLike`
// (`[west, south, east, north]` — confirmed directly against the installed
// maplibre-gl@4.7.1 types, research.md §1), so the caller passes it
// straight to `map.fitBounds()` with zero conversion.
import type { FlowLocation } from '@/panels/flowmapData'
import type { ZoneFeature } from '@/panels/zoneGeometry'

export type BoundsTuple = [west: number, south: number, east: number, north: number]

/**
 * Reduces `buildFlowmapData()`'s own already-deduplicated `locations`
 * output (one entry per unique origin/destination id) to its real bounding
 * box — this already IS "every point any flow touches" (spec.md FR-001),
 * so no second pass over raw rows is needed. Returns `null` for an empty
 * array (spec.md FR-004 — the caller must not attempt a fit against no
 * data).
 */
export function computeFlowBounds(locations: FlowLocation[]): BoundsTuple | null {
  if (locations.length === 0) return null

  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity

  for (const { lat, lon } of locations) {
    if (lon < west) west = lon
    if (lon > east) east = lon
    if (lat < south) south = lat
    if (lat > north) north = lat
  }

  return [west, south, east, north]
}

/**
 * Recursively flattens a GeoJSON `coordinates` array down to its leaf
 * `[lon, lat]` pairs — works uniformly across every GeoJSON geometry type
 * (Polygon/MultiPolygon/etc.) without a type-specific switch, since every
 * one of them is just arbitrarily-nested arrays bottoming out in a 2-tuple
 * of numbers (research.md §5). A `GeometryCollection` (the one GeoJSON
 * geometry shape with no `coordinates` of its own) is handled separately
 * below, not by this function.
 */
function collectLonLatPairs(coords: unknown, out: [number, number][]): void {
  if (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number'
  ) {
    out.push([coords[0], coords[1]])
    return
  }
  if (Array.isArray(coords)) {
    for (const c of coords) collectLonLatPairs(c, out)
  }
}

function collectGeometryLonLatPairs(geometry: GeoJSON.Geometry, out: [number, number][]): void {
  if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries) collectGeometryLonLatPairs(g, out)
    return
  }
  collectLonLatPairs(geometry.coordinates, out)
}

/**
 * Reduces a zone-geometry cache's real polygon extent to its bounding box
 * — independent of which zones currently have matching metric data
 * (spec.md FR-002). Returns `null` for an empty array (spec.md FR-004).
 */
export function computeGeometryBounds(features: ZoneFeature[]): BoundsTuple | null {
  const pairs: [number, number][] = []
  for (const feature of features) {
    collectGeometryLonLatPairs(feature.geometry, pairs)
  }
  if (pairs.length === 0) return null

  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity

  for (const [lon, lat] of pairs) {
    if (lon < west) west = lon
    if (lon > east) east = lon
    if (lat < south) south = lat
    if (lat > north) north = lat
  }

  return [west, south, east, north]
}
