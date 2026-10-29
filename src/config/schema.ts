// The one table of deployer settings (dashboard-config.yaml). The loader, the validator, the cascade resolver, the
// boot-skeleton plugin and the generated reference (project-docs/CONFIG-REFERENCE.md) all read it: a new setting is a new
// row here plus the code that uses the value.
//
// This folder is PURE: relative imports only, no `import.meta.env`, no `@/` alias, no DOM. Node (the Vite plugin) loads it too.

export type SettingType = 'string' | 'number' | 'integer' | 'boolean' | 'boolean|string' | 'color' | 'url' | 'enum' | 'list' | 'map'

/** `false`: site-only. `true`: may be overridden lower down (scalars replace, maps merge). A list says how it merges. */
export type CascadeRule = false | true | { merge: 'replace' | 'concat' }

export interface SettingDef {
  /** Dotted leaf path in the YAML, for example `colors.primary`. */
  path: string
  type: SettingType
  /** Element type of a `list` (default: any). */
  of?: 'string' | 'color' | 'integer'
  /** Used when the key is unset. Absent means "no value", which keeps today's behaviour. */
  default?: unknown
  cascade: CascadeRule
  description: string
  /** Allowed values of an `enum`. */
  values?: readonly string[]
  /** Extra check for a structured value: returns a message when it is wrong. */
  check?: (value: unknown) => string | undefined
}

/** The newest file version this app reads. */
export const SCHEMA_VERSION = 1

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function vocabList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return 'expected a list of { label, ids?, color? }'
  for (const [i, e] of value.entries()) {
    if (!isObject(e) || typeof e.label !== 'string' || e.label === '') return `entry ${i + 1} needs a text label`
    if (e.ids !== undefined && !Array.isArray(e.ids)) return `entry ${i + 1}: ids must be a list`
    if (e.color !== undefined && typeof e.color !== 'string') return `entry ${i + 1}: color must be text`
  }
  return undefined
}

function metricsMap(value: unknown): string | undefined {
  if (!isObject(value)) return 'expected a map of metric name to overrides'
  for (const [k, v] of Object.entries(value)) if (!isObject(v)) return `metric "${k}" must be a map of overrides`
  return undefined
}

function yearList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return 'expected a list of years or { year, label }'
  for (const [i, e] of value.entries()) {
    if (Number.isInteger(e)) continue
    if (isObject(e) && Number.isInteger(e.year) && (e.label === undefined || typeof e.label === 'string')) continue
    return `entry ${i + 1} must be a whole year or { year, label }`
  }
  return undefined
}

function plainMap(value: unknown): string | undefined {
  return isObject(value) ? undefined : 'expected a map'
}

const site = false as const

export const SETTINGS: readonly SettingDef[] = [
  { path: 'version', type: 'integer', default: SCHEMA_VERSION, cascade: site, description: 'File version; a newer one than the app reads is reported.' },
  { path: 'pages', type: 'list', of: 'string', cascade: site, description: 'Page files in display order; the first is the landing page.' },
  { path: 'title', type: 'string', cascade: site, description: 'Dashboard title: the header text and the browser tab title.' },
  { path: 'logo.light', type: 'url', cascade: site, description: 'Full logo shown when the navigation is expanded (light theme).' },
  { path: 'logo.dark', type: 'url', cascade: site, description: 'Full logo for the dark theme.' },
  { path: 'mark.light', type: 'url', cascade: site, description: 'Abbreviated logo shown when the navigation is collapsed (light theme).' },
  { path: 'mark.dark', type: 'url', cascade: site, description: 'Abbreviated logo for the dark theme.' },
  { path: 'colors.primary', type: 'color', cascade: site, description: 'Primary data colour (transit and the chart palette).' },
  { path: 'colors.secondary', type: 'color', cascade: site, description: 'Secondary data colour (walking).' },
  { path: 'colors.accent', type: 'color', cascade: site, description: 'Accent data colour (biking).' },
  { path: 'colors.brand', type: 'color', cascade: site, description: 'Interface colour: selected pills, titles, tags and focus rings.' },
  { path: 'scenario_palette', type: 'list', of: 'color', cascade: site, description: 'Default scenario colours, in order.' },
  { path: 'vocab.modes', type: 'list', cascade: site, check: vocabList, description: 'Travel modes: label, raw data ids and a mode colour token.' },
  { path: 'vocab.purposes', type: 'list', cascade: site, check: vocabList, description: 'Trip purposes: label and raw data ids.' },
  { path: 'vocab.incomes', type: 'list', cascade: site, check: vocabList, description: 'Income groups: label and raw data ids.' },
  { path: 'vocab.autos', type: 'list', cascade: site, check: vocabList, description: 'Auto-ownership groups: label and raw data ids.' },
  { path: 'vocab.districts', type: 'list', cascade: site, check: vocabList, description: 'District names for flow charts and the VMT hierarchy.' },
  { path: 'metrics', type: 'map', cascade: site, check: metricsMap, description: 'Per-metric label, unit, decimals, scale and hidden overrides.' },
  { path: 'units.trips.divisor', type: 'number', cascade: site, description: 'Divisor for trip counts in the time-of-day charts.' },
  { path: 'units.trips.suffix', type: 'string', cascade: site, description: 'Suffix shown after a divided trip count.' },
  { path: 'units.transit_share_max', type: 'number', cascade: site, description: 'Top of the transit-share map ramp.' },
  { path: 'years.list', type: 'list', cascade: site, check: yearList, description: 'Model years in display order: a year, or { year, label }.' },
  { path: 'years.base', type: 'integer', cascade: site, description: 'The base year.' },
  { path: 'years.default', type: 'integer', cascade: site, description: 'The year shown first.' },
  { path: 'compare.default', type: 'enum', values: ['auto', 'on', 'off'], cascade: site, description: 'Whether Compare starts on: auto turns it on with two or more independent scenarios.' },
  { path: 'compare.scenarios', type: 'list', of: 'string', cascade: site, description: 'Scenario groups compared at first load (default: every loaded one).' },
  { path: 'compare.focus', type: 'string', cascade: site, description: 'The focus scenario group.' },
  { path: 'compare.reference', type: 'string', cascade: site, description: 'The reference: a scenario group id or `observed`.' },
  { path: 'layout.mode', type: 'enum', values: ['scroll', 'tabs'], cascade: true, description: 'How pages are shown unless a page or the viewer says otherwise.' },
  { path: 'export.footer', type: 'boolean|string', cascade: true, description: 'Line under exported images: true (source, scenarios, year, date), false (none) or your own text.' },
  { path: 'assistant.enabled', type: 'boolean', cascade: site, description: 'Turns the AI assistant (button, panel and Settings tab) on or off.' },
  { path: 'basemap.default', type: 'string', cascade: true, description: 'Default basemap id (a tab or panel may choose its own).' },
  { path: 'basemap.protomaps.pmtiles_url', type: 'url', cascade: site, description: 'A self-hosted PMTiles file for the Protomaps basemaps.' },
  { path: 'basemap.protomaps.api_key', type: 'string', cascade: site, description: 'A hosted Protomaps key restricted to the site domain (never a secret token).' },
  { path: 'explore.limits', type: 'map', cascade: true, check: plainMap, description: 'Explore builder limits (csv_rows, page_size, undo_steps, max_joins); maps merge per key.' },
  { path: 'explore.features', type: 'map', cascade: true, check: plainMap, description: 'Explore builder features switched on or off; maps merge per key.' },
  { path: 'explore.charts.allow', type: 'list', of: 'string', cascade: { merge: 'replace' }, description: 'Chart types the builder offers; a lower level replaces the list.' },
  { path: 'explore.tables.include', type: 'list', of: 'string', cascade: { merge: 'replace' }, description: 'Table name globs the builder may use; a lower level replaces the list.' },
  { path: 'explore.tables.exclude', type: 'list', of: 'string', cascade: { merge: 'concat' }, description: 'Table name globs the builder hides; lower levels add to the list.' },
  { path: 'explore.columns', type: 'map', cascade: true, check: plainMap, description: 'Column label, unit and format overrides; maps merge per key.' },
  { path: 'explore.presets', type: 'list', cascade: { merge: 'concat' }, description: 'Starter charts; lower levels add to the list.' },
]

/** Row lookup by path, and the set of group prefixes (`colors`, `basemap.protomaps`, ...). */
export function indexSchema(schema: readonly SettingDef[]): { byPath: Map<string, SettingDef>; groups: Set<string> } {
  const byPath = new Map(schema.map((r) => [r.path, r]))
  const groups = new Set<string>()
  for (const r of schema) {
    const parts = r.path.split('.')
    for (let i = 1; i < parts.length; i++) groups.add(parts.slice(0, i).join('.'))
  }
  return { byPath, groups }
}
