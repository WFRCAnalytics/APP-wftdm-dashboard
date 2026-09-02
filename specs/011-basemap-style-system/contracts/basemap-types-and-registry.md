# Contract: `panels/basemap/types.ts` + `panels/basemap/registry.ts`

Full-body code, per this project's established contract discipline since
`008-sankey-panel`.

## `src/panels/basemap/types.ts` (NEW)

```ts
// 011-basemap-style-system: shared types for the built-in preset registry,
// custom compositions, and the panel/tab precedence resolver. See
// data-model.md.

export type BasemapPresetName = string

export interface BasemapComposition {
  layers: string[]
}

export type BasemapSelection = BasemapPresetName | BasemapComposition

export function isBasemapComposition(v: BasemapSelection): v is BasemapComposition {
  return typeof v === 'object' && v !== null && Array.isArray((v as BasemapComposition).layers)
}

export type BasemapSource = 'panel' | 'tab' | 'app-default'

export interface EffectiveBasemap {
  selection: BasemapSelection
  source: BasemapSource
}
```

## `src/panels/basemap/registry.ts` (NEW)

```ts
// 011-basemap-style-system: built-in preset registry (FR-001) + dynamic
// leaflet-providers raster resolution (FR-002/FR-003). See research.md §4/§5.
import type { BasemapPresetName } from '@/panels/basemap/types'

interface UrlPreset {
  kind: 'url'
  url: string
}

export interface RasterSourceSpec {
  kind: 'inline-raster'
  tiles: string[]           // already {s}/{r}-expanded, MapLibre-ready
  attribution?: string
  maxZoom?: number
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

/** Shape of one entry in public/basemap/leaflet-providers.json, matching
 * the real upstream provider-definition object 1:1 (research.md §4) —
 * `url` is the raw {s}/{r}/{z}/{x}/{y} template, never pre-expanded in
 * the data file itself, so re-generating that file never requires a code
 * change on this side (FR-002). */
interface LeafletProviderEntry {
  url: string
  options: {
    subdomains?: string
    attribution?: string
    maxZoom?: number
    variant?: string
    [k: string]: unknown
  }
}

let providersCache: Record<string, LeafletProviderEntry> | null = null

// import.meta.env.BASE_URL, not a hardcoded path — matches
// scenarioDiscovery.ts's/yamlLoader.ts's own established convention (both
// fetched directly to confirm this during plan phase, not assumed).
const base = import.meta.env.BASE_URL

async function loadProvidersCatalog(): Promise<Record<string, LeafletProviderEntry>> {
  if (providersCache) return providersCache
  const res = await fetch(`${base}basemap/leaflet-providers.json`)
  if (!res.ok) throw new Error(`leaflet-providers.json fetch failed: ${res.status}`)
  providersCache = (await res.json()) as Record<string, LeafletProviderEntry>
  return providersCache
}

/**
 * Resolves a raster provider name (e.g. "CartoDB.Positron",
 * "Esri.WorldStreetMap") against the self-hosted catalog and expands its
 * {s}/{r} template into a MapLibre-ready tiles array (research.md §4).
 * {variant} is substituted from options.variant when the entry has one
 * (some providers, like CartoDB, are template + variant rather than a
 * fully-baked per-name URL). Returns undefined for an unresolvable name —
 * the caller (loadBasemapStyle.ts) falls back to BLANK_STYLE, never throws
 * up to the panel (FR-010).
 */
export async function resolveRasterProvider(name: string): Promise<RasterSourceSpec | undefined> {
  let catalog: Record<string, LeafletProviderEntry>
  try {
    catalog = await loadProvidersCatalog()
  } catch {
    return undefined
  }
  const entry = catalog[name]
  if (!entry) return undefined

  const template = entry.url.replace('{variant}', entry.options.variant ?? '')
  const usesSubdomainPlaceholder = template.includes('{s}')

  // Leaflet's own L.TileLayer class carries a DEFAULT `subdomains: 'abc'`
  // (confirmed directly against leaflet/src/layer/tile/TileLayer.js's real
  // source, not assumed) — leaflet-providers.js's per-provider `options`
  // object only ever OVERRIDES that default; a provider that omits
  // `subdomains` entirely still gets a real, working 'abc' at actual
  // Leaflet runtime via L.Util.setOptions's prototype-chain merge. This
  // app's extracted JSON snapshot (public/basemap/leaflet-providers.json)
  // captures only each provider's own raw options object — it does NOT
  // carry Leaflet's class-level default, since that default lives in
  // Leaflet's code, not in the providers data. Checked against the real,
  // current upstream catalog (raw.githubusercontent.com/leaflet-extras/
  // leaflet-providers/master/leaflet-providers.js, fetched directly) —
  // NOT assumed safe: five real, currently-published providers rely on
  // exactly this un-stated default and would otherwise ship a broken tile
  // URL with a literal, un-substituted "{s}" — OpenStreetMap.France,
  // OpenStreetMap.HOT, OpenTopoMap, OpenRailwayMap, and OneMapSG each have
  // "{s}" in their url template with no options.subdomains override at
  // all. Reproducing Leaflet's own default here (only when the template
  // actually uses {s} — most providers don't, and defaulting unconditionally
  // would pad their tiles array with duplicate no-op entries) closes that
  // gap for all five, and for any future provider added to the upstream
  // catalog the same way.
  const subdomains = entry.options.subdomains ?? (usesSubdomainPlaceholder ? 'abc' : '')
  const tiles = subdomains.length
    ? [...subdomains].map((s) => template.replace('{s}', s).replace('{r}', ''))
    : [template.replace('{r}', '')]

  return {
    kind: 'inline-raster',
    tiles,
    attribution: entry.options.attribution,
    maxZoom: entry.options.maxZoom,
  }
}
```

## `scripts/extractLeafletProviders.mjs` (NEW, dev-only — not part of the app bundle)

```js
// 011-basemap-style-system: one-time/refresh extraction of leaflet-providers'
// real provider-definitions data (research.md §4). Uses the REAL `leaflet`
// + `leaflet-providers` packages — devDependencies only (package.json's
// devDependencies, never dependencies) — executed here, in this one
// Node-only script, and nowhere else. No src/ file imports either
// package, so Vite's production build never bundles them; the shipped
// app stays MapLibre-only (constitution Principle VI unaffected). Chosen
// over a regex/Function()-based text extraction of the object literal
// specifically to avoid any "equivalent dynamic code execution" ambiguity
// against constitution Principle III — this reuses the real, already-
// correct upstream UMD module via ordinary `require()`, not a hand-rolled
// evaluator. Run manually (`node scripts/extractLeafletProviders.mjs`)
// when refreshing against a newer upstream release — never at app
// runtime, never in CI on every build.
import { writeFile } from 'node:fs/promises'
import L from 'leaflet' // devDependency only
import 'leaflet-providers' // devDependency only — attaches to the real `L` above

const OUT_PATH = new URL('../public/basemap/leaflet-providers.json', import.meta.url)

const providers = L.TileLayer.Provider.providers
await writeFile(OUT_PATH, JSON.stringify(providers, null, 2))
console.log(`Wrote ${Object.keys(providers).length} providers to ${OUT_PATH}`)
```

```json
// package.json — devDependencies addition (NOT dependencies)
{
  "devDependencies": {
    "leaflet": "^1.9.4",
    "leaflet-providers": "^2.0.0"
  }
}
```

## `tests/unit/resolveRasterProvider.test.ts` (NEW)

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resolveRasterProvider } from '@/panels/basemap/registry'

// Fixture catalog shaped exactly like the real, extracted
// public/basemap/leaflet-providers.json — including two real entries
// confirmed directly against the current upstream source (fetched
// 2026-09-02) that have no options.subdomains of their own, to regression-
// test the Leaflet-class-default gap found during plan review, not just a
// synthetic case.
const FIXTURE_CATALOG = {
  'CartoDB.Positron': {
    url: 'https://{s}.basemaps.cartocdn.com/{variant}/{z}/{x}/{y}{r}.png',
    options: { subdomains: 'abcd', variant: 'light_all', attribution: 'CARTO' },
  },
  // Real entry, real upstream shape — {s} in the url, no subdomains
  // override at all (relies on Leaflet's own class default).
  'OpenTopoMap': {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { attribution: 'OpenTopoMap' },
  },
  // A provider with no {s} at all — must NOT get a padded/duplicated
  // tiles array just because subdomains defaults kick in elsewhere.
  'HikeBike.HikeBike': {
    url: 'https://tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png',
    options: { attribution: 'HikeBike' },
  },
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => FIXTURE_CATALOG })))
})

describe('resolveRasterProvider', () => {
  it('expands {s}/{variant}/{r} using an explicit subdomains option', async () => {
    const result = await resolveRasterProvider('CartoDB.Positron')
    expect(result?.tiles).toEqual([
      'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    ])
  })

  // The real bug found during plan review: without this default, this
  // provider's {s} would ship un-substituted (a literally broken tile
  // URL) since the raw extracted data has no subdomains field at all.
  it('defaults to Leaflet\'s own "abc" subdomains when {s} is used but options.subdomains is absent', async () => {
    const result = await resolveRasterProvider('OpenTopoMap')
    expect(result?.tiles).toEqual([
      'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
    ])
    expect(result?.tiles.some((t) => t.includes('{s}'))).toBe(false)
  })

  it('does not pad the tiles array for a provider whose url has no {s} at all', async () => {
    const result = await resolveRasterProvider('HikeBike.HikeBike')
    expect(result?.tiles).toEqual(['https://tiles.wmflabs.org/hikebike/{z}/{x}/{y}.png'])
  })

  it('returns undefined for an unrecognized provider name', async () => {
    expect(await resolveRasterProvider('Nonexistent.Provider')).toBeUndefined()
  })
})
```
