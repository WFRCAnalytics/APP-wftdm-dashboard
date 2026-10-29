import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/duckdb', () => ({ registerFileURL: vi.fn(), query: vi.fn() }))

import { railGeometryUrl, resolveDemoGeometryUrl, resolveGeometryUrl } from '@/panels/zoneGeometry'

describe('070: where a rail file lives', () => {
  it('is in the demo geometry folder when the demo is on', () => {
    expect(railGeometryUrl('rail.geoparquet', true)).toBe(resolveDemoGeometryUrl('rail.geoparquet'))
    expect(railGeometryUrl('rail.geoparquet', true)).toContain('demo-geometry/')
  })

  it('is beside the deployment boundaries when the demo is off, never under demo-', () => {
    expect(railGeometryUrl('rail.geoparquet', false)).toBe(resolveGeometryUrl('rail.geoparquet'))
    expect(railGeometryUrl('rail.geoparquet', false)).not.toContain('demo-')
  })

  it('reads the demo as off when nothing defines the flag (unit tests)', () => {
    expect(railGeometryUrl('rail.geoparquet')).not.toContain('demo-')
  })
})
