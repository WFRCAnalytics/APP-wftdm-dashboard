import { describe, expect, it } from 'vitest'

import { buildFlowmapData } from '@/panels/flowmapData'
import type { FlowMapPanelConfig } from '@/layout/types'

const config: Pick<
  FlowMapPanelConfig,
  'origin' | 'origin_lat' | 'origin_lon' | 'destination' | 'dest_lat' | 'dest_lon' | 'value'
> = {
  origin: 'orig_taz',
  origin_lat: 'orig_lat',
  origin_lon: 'orig_lon',
  destination: 'dest_taz',
  dest_lat: 'dest_lat',
  dest_lon: 'dest_lon',
  value: 'trips',
}

describe('buildFlowmapData', () => {
  it('deduplicates locations by id, first-seen coordinates win', () => {
    const rows = [
      { orig_taz: 100, orig_lat: 40.76, orig_lon: -111.89, dest_taz: 200, dest_lat: 40.7, dest_lon: -111.85, trips: 10 },
      // Same origin id (100) again, deliberately with DIFFERENT
      // coordinates — the first-seen pair must win, not the second.
      { orig_taz: 100, orig_lat: 41.0, orig_lon: -112.0, dest_taz: 300, dest_lat: 40.85, dest_lon: -111.9, trips: 5 },
    ]
    const data = buildFlowmapData(config, rows)

    expect(data.locations).toHaveLength(3) // 100, 200, 300
    const loc100 = data.locations.find((l) => l.id === '100')
    expect(loc100).toEqual({ id: '100', lat: 40.76, lon: -111.89 })
  })

  it('sums value across duplicate (origin, destination) pairs rather than producing duplicate flows', () => {
    const rows = [
      { orig_taz: 100, orig_lat: 40.76, orig_lon: -111.89, dest_taz: 300, dest_lat: 40.85, dest_lon: -111.9, trips: 120 },
      { orig_taz: 100, orig_lat: 40.76, orig_lon: -111.89, dest_taz: 300, dest_lat: 40.85, dest_lon: -111.9, trips: 80 },
    ]
    const data = buildFlowmapData(config, rows)
    expect(data.flows).toHaveLength(1)
    expect(data.flows[0].value).toBe(200)
  })

  it('excludes non-positive-value rows and reports the correct excludedCount', () => {
    const rows = [
      { orig_taz: 100, orig_lat: 40.76, orig_lon: -111.89, dest_taz: 200, dest_lat: 40.7, dest_lon: -111.85, trips: 500 },
      { orig_taz: 400, orig_lat: 40.6, orig_lon: -111.75, dest_taz: 100, dest_lat: 40.76, dest_lon: -111.89, trips: 0 },
      { orig_taz: 500, orig_lat: 40.75, orig_lon: -112.0, dest_taz: 100, dest_lat: 40.76, dest_lon: -111.89, trips: -10 },
    ]
    const data = buildFlowmapData(config, rows)
    expect(data.excludedCount).toBe(2)
    expect(data.flows).toHaveLength(1)
  })

  it('excludes rows missing a required coordinate (null), distinctly from the non-positive-value case', () => {
    const rows = [
      { orig_taz: 100, orig_lat: 40.76, orig_lon: -111.89, dest_taz: 200, dest_lat: 40.7, dest_lon: -111.85, trips: 500 },
      // orig_lat missing (null) — a real, positive trips value, so this
      // exercises the coordinate check specifically, not the value<=0 one.
      { orig_taz: 600, orig_lat: null, orig_lon: -111.8, dest_taz: 100, dest_lat: 40.76, dest_lon: -111.89, trips: 25 },
    ]
    const data = buildFlowmapData(config, rows)
    expect(data.excludedCount).toBe(1)
    expect(data.flows).toHaveLength(1)
    expect(data.locations.some((l) => l.id === '600')).toBe(false)
  })

  // Number('') is 0, not NaN — the identical false-positive-zero bug
  // Number(null) has, just triggered by a blank string cell instead of a
  // SQL NULL one (found after the null case above, not covered by it —
  // a Parquet/CSV column can plausibly read back as '' rather than NULL
  // depending on how it was written). Also covers a whitespace-only
  // value, which Number() also coerces to 0.
  it('excludes rows with an empty-string or whitespace-only coordinate, the same as a null one', () => {
    const rows = [
      { orig_taz: 100, orig_lat: 40.76, orig_lon: -111.89, dest_taz: 200, dest_lat: 40.7, dest_lon: -111.85, trips: 500 },
      { orig_taz: 700, orig_lat: '', orig_lon: -111.8, dest_taz: 100, dest_lat: 40.76, dest_lon: -111.89, trips: 15 },
      { orig_taz: 800, orig_lat: '   ', orig_lon: -111.8, dest_taz: 100, dest_lat: 40.76, dest_lon: -111.89, trips: 10 },
    ]
    const data = buildFlowmapData(config, rows)
    expect(data.excludedCount).toBe(2)
    expect(data.flows).toHaveLength(1)
    expect(data.locations.some((l) => l.id === '700')).toBe(false)
    expect(data.locations.some((l) => l.id === '800')).toBe(false)
  })

  // Regression coverage for the link-key aggregation bug 008-sankey-panel's
  // contract review found and fixed, applied here as a precedent to avoid,
  // not relearn (research.md §4): keys the aggregation map on a composite
  // string for lookup only, storing the real {origin, dest, value} object
  // as the value — never reconstructed from the key. 3+ distinct locations
  // on each side, asserting each flow's origin/dest EXACTLY match the
  // correct originating location ids, not just that aggregate values are
  // correct (a misaligned-but-numerically-correct flow would not be caught
  // by a value-only assertion).
  it('keeps every flow correctly attributed to its own origin/destination location', () => {
    const rows = [
      { orig_taz: 100, orig_lat: 40.76, orig_lon: -111.89, dest_taz: 200, dest_lat: 40.7, dest_lon: -111.85, trips: 10 },
      { orig_taz: 100, orig_lat: 40.76, orig_lon: -111.89, dest_taz: 300, dest_lat: 40.85, dest_lon: -111.9, trips: 20 },
      { orig_taz: 200, orig_lat: 40.7, orig_lon: -111.85, dest_taz: 400, dest_lat: 40.6, dest_lon: -111.75, trips: 30 },
      { orig_taz: 300, orig_lat: 40.85, orig_lon: -111.9, dest_taz: 500, dest_lat: 40.75, dest_lon: -112.0, trips: 40 },
      { orig_taz: 400, orig_lat: 40.6, orig_lon: -111.75, dest_taz: 100, dest_lat: 40.76, dest_lon: -111.89, trips: 50 },
      { orig_taz: 500, orig_lat: 40.75, orig_lon: -112.0, dest_taz: 200, dest_lat: 40.7, dest_lon: -111.85, trips: 60 },
    ]
    const data = buildFlowmapData(config, rows)

    expect(data.locations).toHaveLength(5)
    expect(data.flows).toHaveLength(6)

    for (const row of rows) {
      const flow = data.flows.find(
        (f) => f.origin === String(row.orig_taz) && f.dest === String(row.dest_taz),
      )
      expect(flow, `expected a flow for ${row.orig_taz} -> ${row.dest_taz}`).toBeDefined()
      expect(flow!.value).toBe(row.trips)
    }
  })
})
