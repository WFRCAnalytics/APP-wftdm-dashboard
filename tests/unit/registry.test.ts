import { describe, expect, it } from 'vitest'
import * as registry from '@/panels/basemap/registry'
import { APP_DEFAULT, resolveBuiltInPreset } from '@/panels/basemap/registry'

// 021-basemap-catalog-redesign
describe('APP_DEFAULT', () => {
  it('resolves to openfreemap-positron unless a deployer changes it (T002/FR-016)', () => {
    // Moved from 'carto-voyager': a muted, keyless, low-cost style is the
    // right app-wide fallback for every unconfigured flowmap/zonemap panel
    // (project-docs/BASEMAP-PICKER-PROPOSAL.md §2/§3). carto-* presets stay
    // available for explicit per-panel/per-tab pins.
    expect(APP_DEFAULT).toBe('openfreemap-positron')
  })

  it('is the sole app-default export — APP_DEFAULT_LIGHT/APP_DEFAULT_DARK no longer exist', () => {
    // A type-level check (tsc --noEmit, T028) is the real enforcement here
    // — `@ts-expect-error` fails the typecheck if either name is ever
    // re-added, since that would make the expected error disappear.
    // @ts-expect-error — APP_DEFAULT_LIGHT was removed by this feature
    expect(registry.APP_DEFAULT_LIGHT).toBeUndefined()
    // @ts-expect-error — APP_DEFAULT_DARK was removed by this feature
    expect(registry.APP_DEFAULT_DARK).toBeUndefined()
  })
})

describe('resolveBuiltInPreset', () => {
  it('returns an unchanged url-kind preset for an existing CARTO/OpenFreeMap name', () => {
    expect(resolveBuiltInPreset('carto-voyager')).toEqual({
      kind: 'url',
      url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    })
  })

  it('returns undefined for an unrecognized name', () => {
    expect(resolveBuiltInPreset('totally-made-up-preset-name')).toBeUndefined()
  })

  it('resolves "ugrc-vector-lite" to the real LiteBase + LiteLabels composition (spec.md Finding 1)', () => {
    expect(resolveBuiltInPreset('ugrc-vector-lite')).toEqual({
      kind: 'composition',
      layers: [
        'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/LiteBase/VectorTileServer/resources/styles/root.json',
        'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/LiteLabels/VectorTileServer/resources/styles/root.json',
      ],
    })
  })

  it('resolves "ugrc-vector-hybrid" to the real Esri.WorldImagery + Vector_Overlay composition', () => {
    expect(resolveBuiltInPreset('ugrc-vector-hybrid')).toEqual({
      kind: 'composition',
      layers: [
        'Esri.WorldImagery',
        'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/Vector_Overlay/VectorTileServer/resources/styles/root.json',
      ],
    })
  })

  it('resolves "ugrc-vector-outdoors" to the real OutdoorsBase + Outdoors_Labels composition', () => {
    expect(resolveBuiltInPreset('ugrc-vector-outdoors')).toEqual({
      kind: 'composition',
      layers: [
        'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/OutdoorsBase/VectorTileServer/resources/styles/root.json',
        'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/Outdoors_Labels/VectorTileServer/resources/styles/root.json',
      ],
    })
  })
})
