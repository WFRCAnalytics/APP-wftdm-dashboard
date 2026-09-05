// 011-basemap-style-system: built-in preset registry (FR-001). Dynamic
// leaflet-providers raster resolution (FR-002/FR-003) is added by
// resolveRasterProvider() below — see research.md §4/§5.
//
// 021-basemap-catalog-redesign: BUILT_IN_PRESETS generalized to a tagged
// union (T004, research.md §1) so a preset name can resolve to either a
// single style.json URL OR a multi-layer BasemapComposition — the exact
// shape an author's own dashboard-*.yaml `basemap: { layers: [...] }`
// already uses (types.ts's own BasemapComposition). This is what lets the
// three new UGRC preset aliases (T005) reach composeStyles() (in
// loadBasemapStyle.ts) through the SAME code path a hand-written
// composition already does — never a second, parallel resolution
// mechanism (FR-009).
import type { BasemapPresetName } from '@/panels/basemap/types'

interface UrlPreset {
  kind: 'url'
  url: string
}

interface CompositionPreset {
  kind: 'composition'
  layers: string[] // identical shape to BasemapComposition.layers (types.ts)
}

type BuiltInPreset = UrlPreset | CompositionPreset

const BUILT_IN_PRESETS: Record<BasemapPresetName, BuiltInPreset> = {
  'carto-positron': { kind: 'url', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
  'carto-dark-matter': { kind: 'url', url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
  'carto-voyager': { kind: 'url', url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
  'openfreemap-liberty': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/liberty' },
  'openfreemap-bright': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/bright' },
  'openfreemap-positron': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/positron' },
  'openfreemap-dark': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/dark' },
  'openfreemap-fiord': { kind: 'url', url: 'https://tiles.openfreemap.org/styles/fiord' },

  // 021-basemap-catalog-redesign (T005): three real, already fixture-
  // tested UGRC compositions (org 99lidPhWCzftIe9K — spec.md Finding 1),
  // promoted from tests/fixtures/dashboard-config/dashboard-3-basemaps.yaml's
  // own ad hoc `basemap: { layers: [...] }` panels into named, reusable
  // presets. Removing any of these three in the future does not remove an
  // author's ability to write the identical composition by hand (FR-009)
  // — these are aliases, not a special case.
  'ugrc-vector-lite': {
    kind: 'composition',
    layers: [
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/LiteBase/VectorTileServer/resources/styles/root.json',
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/LiteLabels/VectorTileServer/resources/styles/root.json',
    ],
  },
  'ugrc-vector-hybrid': {
    kind: 'composition',
    layers: [
      'Esri.WorldImagery',
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/Vector_Overlay/VectorTileServer/resources/styles/root.json',
    ],
  },
  'ugrc-vector-outdoors': {
    kind: 'composition',
    layers: [
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/OutdoorsBase/VectorTileServer/resources/styles/root.json',
      'https://tiles.arcgis.com/tiles/99lidPhWCzftIe9K/arcgis/rest/services/Outdoors_Labels/VectorTileServer/resources/styles/root.json',
    ],
  },
}

// 021-basemap-catalog-redesign (T002): replaces the prior theme-paired
// APP_DEFAULT_LIGHT/APP_DEFAULT_DARK pair — resolveEffectiveBasemap()'s
// bottom fallback tier is now one static value, never theme-dependent
// (research.md §6, FR-015/FR-016). Change this one value to change the
// deployer-configured app-default; if never changed, it is 'carto-voyager'.
export const APP_DEFAULT: BasemapPresetName = 'carto-voyager'

/**
 * 021-basemap-catalog-redesign (T004): replaces resolveUrlPreset() — same
 * lookup, generalized return type. loadBasemapStyle.ts's resolvePresetName()
 * branches on `.kind` to decide between a direct style.json fetch and a
 * composeStyles() call (research.md §1).
 */
export function resolveBuiltInPreset(name: BasemapPresetName): BuiltInPreset | undefined {
  return BUILT_IN_PRESETS[name]
}

/**
 * 020-settings-modal: every built-in preset name, for the Settings
 * modal's Basemap tab picker (FR-011's "same catalog available to
 * dashboard authors") — no prior export exposed this list at all, only
 * single-name lookup via resolveUrlPreset(). A plain array copy, not a
 * live reference to BUILT_IN_PRESETS's own keys — this module's own
 * catalog is a fixed, hardcoded object (unlike the dynamically-fetched
 * leaflet-providers.json catalog below), so no staleness risk either way.
 * Unchanged by 021-basemap-catalog-redesign — still returns every key
 * regardless of `.kind`, including the three new UGRC ones.
 */
export function listBuiltInPresetNames(): BasemapPresetName[] {
  return Object.keys(BUILT_IN_PRESETS)
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

// A malformed/hand-edited catalog COULD reference itself in a cycle
// (A -> B -> A); leaflet-providers.js's own real attributionReplacer
// (quoted directly in resolveAttributionPlaceholders()'s own comment
// below) has no protection against this at all and would recurse until a
// stack overflow. This app resolves at runtime against a fetched catalog
// rather than at author-time against a trusted local require(), so a
// defensive depth cap is worth the one extra line — fail-soft (leave
// whatever placeholders remain unresolved) rather than crash the panel.
// No real chain in the actual generated catalog is deeper than 1 level
// (confirmed directly: every {attribution.X}-containing top-level
// provider's own referenced provider has no placeholder of its own), so
// this cap is pure defense-in-depth, never expected to actually bind.
const MAX_ATTRIBUTION_RESOLUTION_DEPTH = 10

/**
 * Resolves leaflet-providers' own `{attribution.ProviderName}` placeholder
 * convention against the already-loaded catalog — mirroring
 * leaflet-providers.js's real `attributionReplacer` (quoted directly from
 * its source during this session's research,
 * node_modules/leaflet-providers/leaflet-providers.js):
 *
 *   var attributionReplacer = function (attr) {
 *     if (attr.indexOf('{attribution.') === -1) { return attr; }
 *     return attr.replace(/\{attribution.(\w*)\}/g, function (match, attributionName) {
 *       return attributionReplacer(providers[attributionName].options.attribution);
 *     });
 *   };
 *
 * Two real behaviors confirmed directly against that source, not assumed:
 * (1) a placeholder ALWAYS references another TOP-LEVEL provider's own
 * `options.attribution` — never a specific variant's attribution, since
 * variants aren't addressable via `providers[name]` at all; (2) it is
 * genuinely RECURSIVE — the referenced provider's own attribution is
 * itself run back through the replacer before substitution, so a chain
 * (A's attribution references B, B's own attribution references C) fully
 * resolves, not just one level. Confirmed against the real generated
 * catalog (public/basemap/leaflet-providers.json): OpenTopoMap, Esri's
 * variants (via Esri's own top-level attribution — note: Esri's variants
 * carry no placeholder themselves), CartoDB, Stadia, Thunderforest, and
 * several others all reference `{attribution.OpenStreetMap}`; no real
 * entry in the current catalog chains more than one level deep (every
 * referenced provider's own attribution is itself placeholder-free), but
 * this resolves fully recursively regardless, matching leaflet's own
 * behavior exactly rather than only the shallow case seen today.
 *
 * Unlike the real upstream version, this NEVER throws for an unresolvable
 * reference (a hand-edited catalog missing the referenced provider, or a
 * provider whose own `options.attribution` isn't a string) — this
 * feature's established fail-soft convention (FR-010) — leaving that one
 * placeholder's raw, un-substituted text in place rather than losing the
 * rest of an otherwise-valid attribution string.
 */
function resolveAttributionPlaceholders(
  catalog: Record<string, LeafletProviderEntry>,
  attribution: string,
  depth = 0,
): string {
  if (!attribution.includes('{attribution.')) return attribution
  if (depth >= MAX_ATTRIBUTION_RESOLUTION_DEPTH) return attribution
  return attribution.replace(/\{attribution\.(\w*)\}/g, (match, attributionName: string) => {
    const referenced = catalog[attributionName]?.options?.attribution
    if (typeof referenced !== 'string') return match
    return resolveAttributionPlaceholders(catalog, referenced, depth + 1)
  })
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
    attribution: resolved.options.attribution
      ? resolveAttributionPlaceholders(catalog, resolved.options.attribution)
      : resolved.options.attribution,
    maxZoom: resolved.options.maxZoom,
  }
}

// ---- curated raster provider catalog (021-basemap-catalog-redesign, T006) ----

/**
 * A viewer-supplied API key is never acceptable anywhere in this app's
 * built-in catalog (spec.md FR-006, hard constraint) — matched
 * case-insensitively against every real key/token placeholder name seen
 * across the current public/basemap/leaflet-providers.json catalog
 * during this feature's own research (research.md §2).
 */
const API_KEY_TOKEN_PATTERN =
  /\{(apikey|api_key|key|accesstoken|access_token|subscriptionkey|app_id|app_code|token)\}/i

/**
 * The only URL-template tokens this module's own raster-resolution code
 * (resolveRasterProvider() above) actually substitutes. A provider whose
 * URL contains any OTHER {token} (e.g. leaflet-providers' real {ext},
 * {type}, {format}, {time}, {tilematrixset}, {size}, {apiVersion}) would
 * render with that token left literally in the request URL — genuinely
 * keyless, but not currently resolvable by this app, so excluded from the
 * curated list as a scoping decision rather than a licensing one
 * (research.md §2, spec.md Assumptions). {z}/{x}/{y} are handled here too
 * even though this module never substitutes them itself — MapLibre's own
 * native XYZ tile-URL resolution does that at render time.
 */
const HANDLED_RASTER_URL_TOKENS = new Set(['s', 'r', 'variant', 'z', 'x', 'y'])

/**
 * One small, explicit, hand-maintained exclusion — CartoDB's raster tile
 * variants are keyless and technically resolvable, but its equivalent
 * (and better) vector GL styles are already offered, more prominently, in
 * the CARTO Vector Tiles section; surfacing both would present two
 * different-fidelity "Positron"/"Dark Matter"/"Voyager" options with no
 * clear reason to prefer either (spec.md Assumptions). This is the ONLY
 * name excluded for a reason other than the three URL-template conditions
 * below — everything else is computed, not hand-copied, precisely so this
 * list self-corrects the next time leaflet-providers.json is regenerated
 * (research.md §2).
 */
const CURATED_RASTER_EXCLUDE = new Set(['CartoDB'])

function effectiveUrlsForProvider(entry: LeafletProviderEntry): string[] {
  const urls = [entry.url]
  if (entry.variants) {
    for (const variant of Object.values(entry.variants)) {
      if (typeof variant === 'object' && variant.url) urls.push(variant.url)
    }
  }
  return urls
}

function unhandledUrlTokens(url: string): string[] {
  return [...url.matchAll(/\{(\w+)\}/g)].map((m) => m[1].toLowerCase()).filter((t) => !HANDLED_RASTER_URL_TOKENS.has(t))
}

/**
 * A provider is curated only if EVERY effective URL it can produce (its
 * own parent `url`, plus every variant's own `url` override) requires no
 * API key, uses `https://` only (an `http://`-only endpoint is blocked by
 * this app's own HTTPS-served deployments' mixed-content policy — a real,
 * practical exclusion independent of licensing), and uses no URL-template
 * token this module doesn't already substitute (research.md §2).
 */
function isCuratedRasterProvider(name: string, entry: LeafletProviderEntry): boolean {
  if (CURATED_RASTER_EXCLUDE.has(name)) return false
  for (const url of effectiveUrlsForProvider(entry)) {
    if (API_KEY_TOKEN_PATTERN.test(url)) return false
    if (/^http:\/\//i.test(url)) return false
    if (unhandledUrlTokens(url).length > 0) return false
  }
  return true
}

export interface CuratedRasterProvider {
  name: string // dotted PARENT provider name, e.g. "OpenStreetMap"
  variants: string[] // e.g. ["Mapnik", "DE", ...]; empty if the provider has no variants — selectable by its bare `name` in that case
}

/**
 * The Raster Tiles section's own catalog (spec.md FR-006/FR-007/FR-008) —
 * a read-only VIEW over the exact same cached leaflet-providers.json
 * fetch resolveRasterProvider() already performs (no second network
 * request), filtered down to genuinely keyless, HTTPS-only, currently-
 * resolvable entries. Lets the catalog fetch's own rejection propagate
 * (unlike resolveRasterProvider()'s fail-soft "return undefined") — the
 * Basemap tab's own loading/error/empty UI states (research.md §5) need
 * to distinguish "the catalog fetch failed" from "the list is empty" or
 * "still loading," which a swallowed error would make impossible.
 */
export async function listCuratedRasterProviders(signal?: AbortSignal): Promise<CuratedRasterProvider[]> {
  const catalog = await loadProvidersCatalog(signal)
  const curated: CuratedRasterProvider[] = []
  for (const [name, entry] of Object.entries(catalog)) {
    if (!isCuratedRasterProvider(name, entry)) continue
    curated.push({ name, variants: entry.variants ? Object.keys(entry.variants) : [] })
  }
  return curated
}
