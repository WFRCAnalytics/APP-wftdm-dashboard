// 071-network-block: the basemap catalogue as a list of ids and the hosts each one reaches. Pure (the raster provider file is passed in), so the
// app, the Basemap tab and the `check` command share it. Ids: the built-in style names, the Protomaps flavours, and the curated raster providers
// as `Provider` (no variants) or `Provider.Variant`, the same names the Basemap tab selects.
import type { CatalogueEntry } from '@/config'
import { hostOf } from '@/config'
import { isCuratedRasterProvider, listBuiltInPresetNames, resolveBuiltInPreset, type LeafletProviderEntry } from '@/panels/basemap/registry'
import { PROTOMAPS_FLAVOR_NAMES } from '@/panels/basemap/protomapsStyle'

export type RasterCatalog = Record<string, LeafletProviderEntry>

const isWebStyle = (s: string): boolean => /^https?:\/\//i.test(s)

/** The host of a tile URL template: the `{s}.` subdomain placeholder is dropped and other `{tokens}` are made harmless. */
export function hostOfTemplate(template: string): string | undefined {
  return hostOf(template.replace(/\{s\}\./g, '').replace(/\{[^}]*\}/g, 'x'))
}

function rasterHosts(entry: LeafletProviderEntry): string[] {
  const urls = [entry.url]
  for (const v of Object.values(entry.variants ?? {})) if (typeof v === 'object' && v?.url) urls.push(v.url)
  return [...new Set(urls.map(hostOfTemplate).filter((h): h is string => !!h))]
}

/** The curated raster providers as selectable ids. */
export function rasterIds(catalog: RasterCatalog | undefined): string[] {
  const ids: string[] = []
  for (const [name, entry] of Object.entries(catalog ?? {})) {
    if (!isCuratedRasterProvider(name, entry)) continue
    const variants = entry.variants ? Object.keys(entry.variants) : []
    if (variants.length === 0) ids.push(name)
    else for (const v of variants) ids.push(`${name}.${v}`)
  }
  return ids
}

/** The host of one composition layer: a style URL, or a raster provider name looked up in the catalogue. */
function layerHost(layer: string, catalog: RasterCatalog | undefined): string | undefined {
  if (isWebStyle(layer)) return hostOf(layer)
  const entry = catalog?.[layer.split('.')[0]]
  return entry ? rasterHosts(entry)[0] : undefined
}

/** Every catalogue entry (built-in styles, Protomaps flavours, raster providers) with the hosts it reaches, in the catalogue order. */
export function catalogueEntries(catalog: RasterCatalog | undefined): CatalogueEntry[] {
  const entries: CatalogueEntry[] = []
  for (const id of listBuiltInPresetNames()) {
    const preset = resolveBuiltInPreset(id)
    const hosts: (string | undefined)[] = preset?.kind === 'url' ? [hostOf(preset.url)] : (preset?.layers ?? []).map((l) => layerHost(l, catalog))
    if (preset?.kind === 'composition' && preset.glyphs) hosts.push(hostOf(preset.glyphs.replace(/\{[^}]*\}/g, 'x')))
    entries.push({ id, hosts: [...new Set(hosts.filter((h): h is string => !!h))] })
  }
  // a Protomaps flavour reaches the tile file of the deployment, or the hosted service when a key is set: no fixed host to list
  for (const id of PROTOMAPS_FLAVOR_NAMES) entries.push({ id, hosts: [] })
  for (const [name, entry] of Object.entries(catalog ?? {})) {
    if (!isCuratedRasterProvider(name, entry)) continue
    const hosts = rasterHosts(entry)
    const variants = entry.variants ? Object.keys(entry.variants) : []
    if (variants.length === 0) entries.push({ id: name, hosts })
    else for (const v of variants) entries.push({ id: `${name}.${v}`, hosts })
  }
  return entries
}

/** Every id the catalogue can select. */
export function catalogueIds(catalog: RasterCatalog | undefined): string[] {
  return catalogueEntries(catalog).map((e) => e.id)
}
