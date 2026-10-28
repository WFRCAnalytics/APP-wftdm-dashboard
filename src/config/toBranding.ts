// Maps the resolved settings tree onto the object the app already reads (`DashboardBranding`), so no chart, layout or state
// module has to know the file layout. Pure (the import below is a type only).
import type { DashboardBranding, ModelYear } from '../services/yamlLoader'
import { getPath, type Tree } from './paths'

const str = (t: Tree, p: string): string | undefined => {
  const v = getPath(t, p)
  return typeof v === 'string' && v.length > 0 ? v : undefined
}
const num = (t: Tree, p: string): number | undefined => {
  const v = getPath(t, p)
  return typeof v === 'number' ? v : undefined
}
const strList = (t: Tree, p: string): string[] | undefined => {
  const v = getPath(t, p)
  return Array.isArray(v) ? v.filter((e): e is string => typeof e === 'string') : undefined
}

function years(t: Tree): ModelYear[] | undefined {
  const v = getPath(t, 'years.list')
  if (!Array.isArray(v)) return undefined
  const out = v.map((e): ModelYear => (typeof e === 'number' ? { year: e } : { year: (e as { year: number }).year, label: (e as { label?: string }).label }))
  return out.length > 0 ? out : undefined
}

export function toBranding(settings: Tree): DashboardBranding {
  const scenarios = strList(settings, 'compare.scenarios')
  return {
    title: str(settings, 'title'),
    logoUrl: str(settings, 'logo.light'),
    logoUrlDark: str(settings, 'logo.dark'),
    markUrl: str(settings, 'mark.light'),
    markUrlDark: str(settings, 'mark.dark'),
    scenarioPalette: strList(settings, 'scenario_palette'),
    protomapsPmtilesUrl: str(settings, 'basemap.protomaps.pmtiles_url'),
    protomapsApiKey: str(settings, 'basemap.protomaps.api_key'),
    primaryColor: str(settings, 'colors.primary'),
    secondaryColor: str(settings, 'colors.secondary'),
    accentColor: str(settings, 'colors.accent'),
    brandColor: str(settings, 'colors.brand'),
    years: years(settings),
    baseYear: num(settings, 'years.base'),
    defaultYear: num(settings, 'years.default'),
    compareDefault: getPath(settings, 'compare.default') as DashboardBranding['compareDefault'],
    compareScenarios: scenarios && scenarios.length > 0 ? scenarios : undefined,
    compareFocus: str(settings, 'compare.focus'),
    compareReference: str(settings, 'compare.reference'),
    vocab: vocab(settings),
    metrics: getPath(settings, 'metrics') as DashboardBranding['metrics'],
    units: units(settings),
    exportFooter: getPath(settings, 'export.footer') as DashboardBranding['exportFooter'],
    layout: layout(settings),
    assistantEnabled: getPath(settings, 'assistant.enabled') as boolean | undefined,
  }
}

function vocab(t: Tree): DashboardBranding['vocab'] {
  const v = getPath(t, 'vocab')
  return v && typeof v === 'object' ? (v as DashboardBranding['vocab']) : undefined
}

function units(t: Tree): DashboardBranding['units'] {
  const trips = { divisor: num(t, 'units.trips.divisor'), suffix: getPath(t, 'units.trips.suffix') as string | undefined }
  const out: NonNullable<DashboardBranding['units']> = {}
  if (trips.divisor !== undefined || trips.suffix !== undefined) out.trips = trips
  const max = num(t, 'units.transit_share_max')
  if (max !== undefined) out.transit_share_max = max
  return Object.keys(out).length > 0 ? out : undefined
}

function layout(t: Tree): DashboardBranding['layout'] {
  const mode = getPath(t, 'layout.mode')
  return mode === 'scroll' || mode === 'tabs' ? { mode } : undefined
}
