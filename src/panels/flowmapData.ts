// 010-flowmap-panel: rows-to-flowmap transform — pure, DOM-free, mirrors
// 008-sankey-panel's sankeyGraph.ts precedent (research.md §4). See
// specs/010-flowmap-panel/data-model.md.
import type { FlowMapPanelConfig } from '@/layout/types'

export interface FlowLocation {
  id: string
  lat: number
  lon: number
}

export interface Flow {
  origin: string
  dest: string
  value: number
}

export interface FlowmapData {
  locations: FlowLocation[]
  flows: Flow[]
  excludedCount: number
}

/**
 * `Number(null)` is `0`, and `Number('')`/`Number('   ')` are *also* `0`
 * — not `NaN` — so a plain `Number()` coercion silently turns a genuinely
 * missing/blank value into a bogus "valid" 0 rather than an excludable
 * NaN. A first version of this guard only rejected `null`/`undefined`
 * explicitly, missing the identical failure mode for a blank string cell
 * (a real, found gap — a Parquet/CSV column can plausibly read back as
 * `''` rather than SQL NULL depending on how it was written). Real
 * numbers are returned directly without going through `Number()` coercion
 * at all, so this function's behavior for the common case doesn't depend
 * on `Number()`'s own coercion quirks in the first place.
 */
function toNumberOrNaN(v: unknown): number {
  if (typeof v === 'number') return v
  if (v == null) return NaN
  if (typeof v === 'string' && v.trim() === '') return NaN
  return Number(v)
}

/**
 * Deduplicates locations by id (first-seen coordinates win — matches
 * both real reference apps' own Map-keyed-by-id dedup behavior,
 * confirmed against their fetched source). Sums `value` across rows
 * sharing an (origin, destination) pair. Excludes rows missing a
 * required coordinate or contributing a non-positive value (research.md
 * §5). The flows map is keyed on a composite string for lookup only,
 * storing the real {origin, dest, value} object as the value — NEVER
 * reconstructed from the key (008-sankey-panel's own link-key bug,
 * applied here as a precedent to avoid, not relearn).
 */
export function buildFlowmapData(
  config: Pick<
    FlowMapPanelConfig,
    'origin' | 'origin_lat' | 'origin_lon' | 'destination' | 'dest_lat' | 'dest_lon' | 'value'
  >,
  rows: Record<string, unknown>[],
): FlowmapData {
  const locationsById = new Map<string, FlowLocation>()
  const flowsByKey = new Map<string, Flow>()
  let excludedCount = 0

  for (const row of rows) {
    const originId = String(row[config.origin])
    const destId = String(row[config.destination])
    // Number(null)/Number('') are both 0 — a valid, finite (but bogus)
    // coordinate — not NaN, so a plain Number.isFinite() check alone
    // would silently treat a genuinely missing or blank coordinate as
    // "0,0" instead of excluding it (two real bugs, found and fixed
    // separately — this module's own unit tests cover both the null and
    // the empty-string case, not just whichever was found first).
    // toNumberOrNaN rejects both explicitly before any Number() coercion.
    const originLat = toNumberOrNaN(row[config.origin_lat])
    const originLon = toNumberOrNaN(row[config.origin_lon])
    const destLat = toNumberOrNaN(row[config.dest_lat])
    const destLon = toNumberOrNaN(row[config.dest_lon])
    const value = toNumberOrNaN(row[config.value])

    if (
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLon) ||
      !Number.isFinite(destLat) ||
      !Number.isFinite(destLon) ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      excludedCount += 1
      continue
    }

    if (!locationsById.has(originId)) {
      locationsById.set(originId, { id: originId, lat: originLat, lon: originLon })
    }
    if (!locationsById.has(destId)) {
      locationsById.set(destId, { id: destId, lat: destLat, lon: destLon })
    }

    const key = originId + '|' + destId
    const existing = flowsByKey.get(key)
    if (existing) existing.value += value
    else flowsByKey.set(key, { origin: originId, dest: destId, value })
  }

  return {
    locations: [...locationsById.values()],
    flows: [...flowsByKey.values()],
    excludedCount,
  }
}
