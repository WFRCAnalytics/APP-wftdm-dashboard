// 071-network-block: the basemap allow-list (`network.basemaps.allow`) applied to what a map is about to show. A catalogue name that is not allowed
// is replaced by the first allowed catalogue entry, or by the plain blank background when nothing matches; each distinct replacement is reported
// once through the configuration note. A style the deployer wrote in a page (a `layers` composition or a full style URL) is the deployer's own
// explicit choice, never a viewer pick, so it is never blocked (`check --explain` lists its hosts). With no list the policy changes nothing.
import { allowedIds, isAllowed } from '@/config'
import { catalogueIds } from '@/panels/basemap/catalogue'
import { getLoadedProvidersCatalog } from '@/panels/basemap/registry'
import type { BasemapSelection } from '@/panels/basemap/types'
import { getBasemapAllowList } from '@/services/networkPolicy'
import { addProblems } from '@/state/configProblems'

/** The reserved selection for the plain background: loadBasemapStyle answers it with the blank style and no request. */
export const BLANK_BASEMAP = 'blank-background'

const reported = new Set<string>()

const isStyleUrl = (s: string): boolean => /^https?:\/\//i.test(s.trim())

/** Whether a selection may be shown: a catalogue name must match the list; a composition or a style URL is the deployer's own and always may. */
export function isBasemapAllowed(selection: BasemapSelection): boolean {
  if (typeof selection !== 'string') return true
  if (selection === BLANK_BASEMAP || isStyleUrl(selection)) return true
  return isAllowed(getBasemapAllowList(), selection)
}

/** The catalogue entries the list allows, in catalogue order (the raster providers once their file has loaded). */
export function allowedBasemapIds(): string[] {
  return allowedIds(getBasemapAllowList(), catalogueIds(getLoadedProvidersCatalog()))
}

/** The first allowed entry, or the blank background. */
export function firstAllowedBasemap(): string {
  return allowedBasemapIds()[0] ?? BLANK_BASEMAP
}

/** A name that is allowed, else the first allowed entry (no report): for a control that must start on something allowed. */
export function allowedOrFirst(name: string): string {
  return isBasemapAllowed(name) ? name : firstAllowedBasemap()
}

/** `source` names the level the selection came from, for the report. Returns the selection, or its replacement. */
export function applyBasemapPolicy(selection: BasemapSelection, source: string): BasemapSelection {
  if (isBasemapAllowed(selection)) return selection
  const replacement = firstAllowedBasemap()
  const name = typeof selection === 'string' ? selection : JSON.stringify(selection)
  const key = `${source}|${name}`
  if (!reported.has(key)) {
    reported.add(key)
    addProblems([
      {
        file: 'dashboard-config.yaml',
        path: 'network.basemaps.allow',
        kind: 'invalid_value',
        message: `the basemap "${name}" (${source}) is not allowed; ${replacement === BLANK_BASEMAP ? 'the plain background is used' : `"${replacement}" is used`}`,
      },
    ])
  }
  return replacement
}

export function resetBasemapPolicy(): void {
  reported.clear()
}
