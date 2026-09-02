// 011-basemap-style-system: built-in preset registry (FR-001). Dynamic
// leaflet-providers raster resolution (FR-002/FR-003) is added by
// resolveRasterProvider() below — see research.md §4/§5.
import type { BasemapPresetName } from '@/panels/basemap/types'

interface UrlPreset {
  kind: 'url'
  url: string
}

const BUILT_IN_PRESETS: Record<BasemapPresetName, UrlPreset> = {
  'carto-positron': { kind: 'url', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
  'carto-dark-matter': { kind: 'url', url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
  'carto-voyager': { kind: 'url', url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
  'openfreemap-liberty': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/liberty' },
  'openfreemap-bright': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/bright' },
  'openfreemap-positron': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/positron' },
  'openfreemap-dark': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/dark' },
  'openfreemap-fiord': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/fiord' },
}

export const APP_DEFAULT_LIGHT: BasemapPresetName = 'carto-positron'
export const APP_DEFAULT_DARK: BasemapPresetName = 'carto-dark-matter'

export function resolveUrlPreset(name: BasemapPresetName): UrlPreset | undefined {
  return BUILT_IN_PRESETS[name]
}

// ---- leaflet-providers raster resolution (FR-002/FR-003) ----

export interface RasterSourceSpec {
  kind: 'inline-raster'
  tiles: string[] // already {s}/{r}/{variant}-expanded, MapLibre-ready
  attribution?: string
  maxZoom?: number
}

/** Shape of one entry in public/basemap/leaflet-providers.json, matching
 * the real upstream provider-definition object 1:1 (research.md §4) —
 * `url`/`options` are the raw, un-expanded per-provider values; most
 * real, practically-useful providers (CartoDB, Esri, Stadia, ...) are a
 * PARENT entry with a `variants` map, addressed via leaflet-providers'
 * own dotted convention ("CartoDB.Positron"), not a flat per-variant key
 * — confirmed against the real generated catalog during implementation,
 * not the plan-phase contract's original flat-lookup design. */
interface LeafletProviderVariant {
  url?: string
  options?: Record<string, unknown>
}

interface LeafletProviderEntry {
  url: string
  options: {
    subdomains?: string
    attribution?: string
    maxZoom?: number
    variant?: string
    [k: string]: unknown
  }
  // A variant value is one of three real shapes (research.md §4): a
  // plain string (substituted into options.variant for a {variant} URL
  // placeholder — e.g. CartoDB.Positron: "light_all"), an empty object
  // (no overrides at all — e.g. OpenStreetMap.Mapnik: {}), or a full
  // object with its own url/options (e.g. OpenStreetMap.HOT).
  variants?: Record<string, string | LeafletProviderVariant>
}

let providersCache: Record<string, LeafletProviderEntry> | null = null

/** Test-only — resets the module-level catalog cache so a test exercising
 * a failed/mocked fetch isn't silently served an earlier test's cached
 * success (found necessary while writing resolveRasterProvider.test.ts:
 * without this, a "the catalog fetch fails" test after any successful
 * one would pass for the wrong reason — the cache, not the mocked
 * failure, would be what it actually exercised). Same category of
 * test-only, additive-only instrumentation as FlowMapPanel.tsx's own
 * __flowmapTestMapReadyDelayMs/__flowmapTestMaps — never called from
 * application code. */
export function __resetProvidersCacheForTests(): void {
  providersCache = null
}

// import.meta.env.BASE_URL, not a hardcoded path — matches
// scenarioDiscovery.ts's/yamlLoader.ts's own established convention.
const base = import.meta.env.BASE_URL

async function loadProvidersCatalog(signal?: AbortSignal): Promise<Record<string, LeafletProviderEntry>> {
  if (providersCache) return providersCache
  const res = await fetch(`${base}basemap/leaflet-providers.json`, { signal })
  if (!res.ok) throw new Error(`leaflet-providers.json fetch failed: ${res.status}`)
  providersCache = (await res.json()) as Record<string, LeafletProviderEntry>
  return providersCache
}

/**
 * Resolves a dotted provider/variant name ("CartoDB.Positron",
 * "OpenTopoMap" with no variant, "OneMapSG.Night") against the real
 * catalog shape, mirroring leaflet-providers.js's own real
 * `L.TileLayer.Provider#initialize()` merge logic (quoted directly from
 * its source during this session's research): start from the parent's
 * own url/options, then apply the named variant's overrides according to
 * which of the three real shapes it is. Returns undefined for an
 * unresolvable provider or variant name — the caller falls back to
 * BLANK_STYLE (FR-010), never throws.
 */
function resolveProviderEntry(
  catalog: Record<string, LeafletProviderEntry>,
  name: string,
): { url: string; options: LeafletProviderEntry['options'] } | undefined {
  const [providerName, variantName] = name.split('.')
  const parent = catalog[providerName]
  if (!parent) return undefined

  let url = parent.url
  let options = { ...parent.options }

  if (variantName) {
    const variant = parent.variants?.[variantName]
    if (variant === undefined) return undefined
    if (typeof variant === 'string') {
      options = { ...options, variant }
    } else {
      if (variant.url) url = variant.url
      if (variant.options) options = { ...options, ...variant.options }
    }
  }

  return { url, options }
}

/**
 * Resolves a raster provider name (e.g. "CartoDB.Positron",
 * "Esri.WorldStreetMap", "OpenTopoMap") against the self-hosted catalog
 * and expands its {s}/{r}/{variant} template into a MapLibre-ready tiles
 * array (research.md §4). Returns undefined for an unresolvable name —
 * the caller (loadBasemapStyle.ts) falls back to BLANK_STYLE, never
 * throws up to the panel (FR-010).
 */
export async function resolveRasterProvider(
  name: string,
  signal?: AbortSignal,
): Promise<RasterSourceSpec | undefined> {
  let catalog: Record<string, LeafletProviderEntry>
  try {
    catalog = await loadProvidersCatalog(signal)
  } catch (e) {
    // An aborted catalog fetch must propagate as a real abort (caught by
    // loadBasemapStyle.ts's own AbortError check), not be swallowed into
    // "provider not found" — those are different outcomes for a
    // different caller-level guard (research.md §1/generation-counter
    // fix's own reasoning).
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    return undefined
  }
  const resolved = resolveProviderEntry(catalog, name)
  if (!resolved) return undefined

  const template = resolved.url.replace('{variant}', resolved.options.variant ?? '')
  const usesSubdomainPlaceholder = template.includes('{s}')

  // Leaflet's own L.TileLayer class carries a DEFAULT `subdomains: 'abc'`
  // (confirmed directly against leaflet/src/layer/tile/TileLayer.js's real
  // source, not assumed) — leaflet-providers.js's per-provider `options`
  // object only ever OVERRIDES that default; a provider that omits
  // `subdomains` entirely still gets a real, working 'abc' at actual
  // Leaflet runtime via L.Util.setOptions's prototype-chain merge. This
  // app's extracted JSON snapshot captures only each provider's own raw
  // options object — it does NOT carry Leaflet's class-level default.
  // Checked against the real, current catalog (public/basemap/
  // leaflet-providers.json) — NOT assumed safe: OpenStreetMap.France,
  // OpenStreetMap.HOT, OpenTopoMap, OpenRailwayMap, and OneMapSG each
  // have "{s}" in their url template with no options.subdomains override
  // at all, and would otherwise ship a broken, un-substituted "{s}".
  // Applied only when the template actually uses {s} — most providers
  // don't, and defaulting unconditionally would pad their tiles array
  // with duplicate no-op entries.
  const subdomains = resolved.options.subdomains ?? (usesSubdomainPlaceholder ? 'abc' : '')
  const tiles = subdomains.length
    ? [...subdomains].map((s) => template.replace('{s}', s).replace('{r}', ''))
    : [template.replace('{r}', '')]

  return {
    kind: 'inline-raster',
    tiles,
    attribution: resolved.options.attribution,
    maxZoom: resolved.options.maxZoom,
  }
}
