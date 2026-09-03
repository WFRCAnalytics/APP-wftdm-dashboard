// research.md §11: loadZoneGeometry()'s boundaries_id cache-key mismatch
// behavior — a real gap caught in this contract's first draft before
// implementation began (the cache is keyed on `boundaries` alone and
// shared across panels, but had no way to detect two panels naming the
// same `boundaries` file with two different `boundaries_id` values).
//
// Written now, against the not-yet-implemented src/panels/zoneGeometry.ts
// (013-zonemap-panel is still in planning — no source file exists yet),
// per the user's own explicit instruction to pin this decision down with
// a real test before /speckit-tasks. This test intentionally fails to
// resolve its import until that module exists — that's the point: it
// specifies the exact contract implementation must satisfy, the same way
// contracts/zonemap-panel.md's own signatures do, just runnable.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/duckdb', () => ({
  registerFileURL: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue([
    {
      zone_id: 'Z1',
      geojson: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}',
    },
  ]),
}))

import { query, registerFileURL } from '@/services/duckdb'
import { loadZoneGeometry } from '@/panels/zoneGeometry'

describe('loadZoneGeometry — boundaries_id cache-key mismatch (research.md §11)', () => {
  beforeEach(() => {
    vi.mocked(query).mockClear()
    vi.mocked(registerFileURL).mockClear()
  })

  it('returns the exact same cached promise for a repeat call sharing both boundaries AND boundaries_id', async () => {
    const first = loadZoneGeometry('taz.geoparquet', 'TAZ_ID')
    const second = loadZoneGeometry('taz.geoparquet', 'TAZ_ID')

    // Same promise INSTANCE, not just an equal resolved value — proves
    // the second call never re-triggered registerFileURL()/query() at
    // all (FR-003/§4's whole reason for existing).
    expect(second).toBe(first)

    await first
    const geometryQueryCalls = vi.mocked(query).mock.calls.filter(([sql]) =>
      String(sql).includes('ST_AsGeoJSON'),
    )
    expect(geometryQueryCalls).toHaveLength(1)
  })

  it('rejects a mismatched boundaries_id immediately, without disturbing the existing cache entry', async () => {
    const first = loadZoneGeometry('district.geoparquet', 'DISTRICT_ID')
    await expect(first).resolves.toBeDefined()

    const queryCallCountAfterFirstLoad = vi.mocked(query).mock.calls.length

    // A second, misconfigured panel referencing the SAME file with a
    // DIFFERENT boundaries_id (a typo'd/copy-pasted config, the
    // realistic case research.md §11 reasons about) — must fail loudly
    // and name both values, never silently join against the first
    // caller's column.
    await expect(loadZoneGeometry('district.geoparquet', 'SUPER_DISTRICT_ID')).rejects.toThrow(
      /district\.geoparquet/,
    )
    await expect(loadZoneGeometry('district.geoparquet', 'SUPER_DISTRICT_ID')).rejects.toThrow(
      /DISTRICT_ID/,
    )
    await expect(loadZoneGeometry('district.geoparquet', 'SUPER_DISTRICT_ID')).rejects.toThrow(
      /SUPER_DISTRICT_ID/,
    )

    // Detected synchronously from the two strings alone — no new
    // registerFileURL()/query() activity for the mismatched call.
    expect(vi.mocked(query).mock.calls.length).toBe(queryCallCountAfterFirstLoad)

    // The ORIGINAL, correctly-matching entry is untouched by the
    // mismatch — every other panel already relying on it keeps working.
    const third = loadZoneGeometry('district.geoparquet', 'DISTRICT_ID')
    expect(third).toBe(first)
    await expect(third).resolves.toBeDefined()
  })
})
