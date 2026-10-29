// The `network` block's own rules (dashboard-config.yaml), pure: which basemap ids a pattern list allows, which patterns match nothing, and which
// outside hosts a configuration can still reach. The catalogue ids and hosts are passed in (the basemap catalogue lives in src/panels), as
// `checkDefault` does for the assistant, so this folder stays free of the app. The schema rows, the loader and the `check` command call it.

export type FontMode = 'bundled' | 'any'
export const NETWORK_FONT_MODES: readonly FontMode[] = ['bundled', 'any']

/** A pattern as a regular expression: `*` is the only wildcard, everything else is literal, the whole id must match, case does not matter. */
export function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')
}

export function matchesAny(patterns: readonly string[], id: string): boolean {
  return patterns.some((p) => globToRegExp(p).test(id))
}

/** An empty or absent list allows everything; otherwise an id must match one pattern. */
export function isAllowed(patterns: readonly string[] | undefined, id: string): boolean {
  return !patterns || patterns.length === 0 || matchesAny(patterns, id)
}

/** The ids the list allows, in the catalogue's own order. */
export function allowedIds(patterns: readonly string[] | undefined, ids: readonly string[]): string[] {
  return ids.filter((id) => isAllowed(patterns, id))
}

/** The patterns that match none of the known ids (each is reported by `check`). */
export function unmatchedPatterns(patterns: readonly string[] | undefined, ids: readonly string[]): string[] {
  return (patterns ?? []).filter((p) => !ids.some((id) => globToRegExp(p).test(id)))
}

export interface CatalogueEntry {
  id: string
  /** The hosts this entry reaches (derived from its URLs). */
  hosts: string[]
}

export interface OutsideHostInput {
  fonts?: FontMode
  /** The deployer's extension address (a web address), if set. */
  extensionAddress?: string
  patterns?: readonly string[]
  catalogue: readonly CatalogueEntry[]
  /** Hosts of styles the deployer wrote in pages (a composition or a full style URL), each with where it was found. */
  authored?: readonly { host: string; where: string }[]
}

export interface OutsideHost {
  host: string
  why: string
}

export const GOOGLE_FONTS_HOST = 'fonts.googleapis.com'
export const DUCKDB_EXTENSIONS_HOST = 'extensions.duckdb.org'

/** The outside hosts a configuration can still reach where the app knows them, sorted and unique by host and reason. */
export function outsideHosts({ fonts, extensionAddress, patterns, catalogue, authored = [] }: OutsideHostInput): OutsideHost[] {
  const found = new Map<string, OutsideHost>()
  const add = (host: string, why: string) => {
    const key = `${host}|${why}`
    if (host && !found.has(key)) found.set(key, { host, why })
  }
  if (fonts !== 'bundled') add(GOOGLE_FONTS_HOST, 'fonts are not bundled')
  if (!extensionAddress) add(DUCKDB_EXTENSIONS_HOST, 'no network.duckdb_extensions')
  for (const entry of catalogue) {
    if (!isAllowed(patterns, entry.id)) continue
    for (const host of entry.hosts) add(host, `allowed basemap ${entry.id}`)
  }
  for (const a of authored) add(a.host, a.where)
  return [...found.values()].sort((a, b) => a.host.localeCompare(b.host) || a.why.localeCompare(b.why))
}

/** The host of an address, or undefined when it is not one. */
export function hostOf(address: string): string | undefined {
  try {
    return new URL(address).host || undefined
  } catch {
    return undefined
  }
}
