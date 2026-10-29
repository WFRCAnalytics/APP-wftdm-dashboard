// 071-network-block: what boot resolved from the `network` block, for the code that makes outside calls. Plain module state (never Web Storage),
// like assistantPolicy.ts. Unset keys give today's behaviour: any font, every basemap, DuckDB's own extension host.
export interface NetworkInput {
  fonts?: 'bundled' | 'any'
  basemapsAllow?: string[]
  duckdbExtensions?: string
}

let fonts: 'bundled' | 'any' = 'any'
let allow: string[] = []
let extensionRepository: string | undefined

/** Called once at boot with the site's `network` settings (undefined: nothing configured). */
export function configureNetwork(input?: NetworkInput): void {
  fonts = input?.fonts === 'bundled' ? 'bundled' : 'any'
  allow = input?.basemapsAllow ? [...input.basemapsAllow] : []
  extensionRepository = input?.duckdbExtensions || undefined
}

/** True when only the fonts that ship with the app may be offered or loaded. */
export const fontsBundled = (): boolean => fonts === 'bundled'
/** The basemap allow-list patterns; empty means every basemap is allowed. */
export const getBasemapAllowList = (): readonly string[] => allow
/** The extension mirror address, when one is configured. */
export const getExtensionRepository = (): string | undefined => extensionRepository

export function resetNetworkPolicy(): void {
  configureNetwork(undefined)
}
