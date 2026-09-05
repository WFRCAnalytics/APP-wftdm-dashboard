import { describe, expect, it } from 'vitest'

import { computeFlowBounds, computeGeometryBounds } from '@/panels/mapBounds'
import type { FlowLocation } from '@/panels/flowmapData'
import type { ZoneFeature } from '@/panels/zoneGeometry'

describe('computeFlowBounds', () => {
  it('returns null for an empty array (spec.md FR-004)', () => {
    expect(computeFlowBounds([])).toBeNull()
  })

  it('reduces multiple locations to their real bounding box', () => {
    const locations: FlowLocation[] = [
      { id: '100', lat: 40.76, lon: -111.89 },
      { id: '200', lat: 40.7, lon: -111.85 },
      { id: '300', lat: 40.85, lon: -111.95 },
    ]
    expect(computeFlowBounds(locations)).toEqual([-111.95, 40.7, -111.85, 40.85])
  })

  it('resolves a degenerate single-point extent (zero-area bounds, not a crash)', () => {
    const locations: FlowLocation[] = [
      { id: '100', lat: 40.76, lon: -111.89 },
      { id: '200', lat: 40.76, lon: -111.89 },
    ]
    expect(computeFlowBounds(locations)).toEqual([-111.89, 40.76, -111.89, 40.76])
  })
})

describe('computeGeometryBounds', () => {
  it('returns null for an empty array (spec.md FR-004)', () => {
    expect(computeGeometryBounds([])).toBeNull()
  })

  it('reduces multiple Polygon/MultiPolygon features to their real bounding box', () => {
    const features: ZoneFeature[] = [
      {
        zoneId: '100',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-111.9, 40.7],
              [-111.8, 40.7],
              [-111.8, 40.8],
              [-111.9, 40.8],
              [-111.9, 40.7],
            ],
          ],
        },
      },
      {
        zoneId: '200',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-112.0, 40.6],
                [-111.95, 40.6],
                [-111.95, 40.65],
                [-112.0, 40.65],
                [-112.0, 40.6],
              ],
            ],
          ],
        },
      },
    ]
    expect(computeGeometryBounds(features)).toEqual([-112.0, 40.6, -111.8, 40.8])
  })

  it('resolves a degenerate single-polygon-vertex-set extent (a single distinct point) without crashing', () => {
    const features: ZoneFeature[] = [
      {
        zoneId: '100',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-111.9, 40.7],
              [-111.9, 40.7],
              [-111.9, 40.7],
            ],
          ],
        },
      },
    ]
    expect(computeGeometryBounds(features)).toEqual([-111.9, 40.7, -111.9, 40.7])
  })

  it('handles a GeometryCollection by recursing into its member geometries', () => {
    const features: ZoneFeature[] = [
      {
        zoneId: '100',
        geometry: {
          type: 'GeometryCollection',
          geometries: [
            { type: 'Point', coordinates: [-111.9, 40.7] },
            { type: 'Point', coordinates: [-111.8, 40.8] },
          ],
        },
      },
    ]
    expect(computeGeometryBounds(features)).toEqual([-111.9, 40.7, -111.8, 40.8])
  })
})
