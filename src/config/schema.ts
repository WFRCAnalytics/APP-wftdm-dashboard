// The one table of deployer settings (dashboard-config.yaml). The loader, the validator, the cascade resolver, the
// boot-skeleton plugin and the generated reference (project-docs/CONFIG-REFERENCE.md) all read it: a new setting is a new
// row here plus the code that uses the value.
//
// This folder is PURE: relative imports only, no `import.meta.env`, no `@/` alias, no DOM. Node (the Vite plugin) loads it too.
import { addendumCheck, cleanProviders, limitCheck } from './assistant'
import { cleanMaxActive, cleanWarnAt } from './scenarioLimits'
import { EXPLORE_LIMITS, limitClean, limitText } from './exploreLimits'
import { NETWORK_FONT_MODES } from './network'
import { cleanSettingsTabs, isRelativePath, isWebAddress } from './viewer'

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
  /**
   * `page`: set in a page file's `header:`, never in the site file, and never cascading (a page's identity stays with the page).
   * Absent: a site setting (it may also cascade, per `cascade`).
   */
  scope?: 'page'
  /**
   * Keeps the usable part of a value: returns it, with a message for each thing dropped (reported as `invalid_value`). Used for a
   * list where one bad entry must not discard the good ones. A returned `undefined` leaves the key unset.
   */
  clean?: (value: unknown) => { value: unknown; messages: string[] }
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
  { path: 'scenarios.warn_at', type: 'integer', cascade: site, clean: cleanWarnAt, description: 'Scenarios on at once above which the viewer sees a warning (default 8).' },
  { path: 'scenarios.max_active', type: 'integer', cascade: site, clean: cleanMaxActive, description: 'The most scenarios that can be on at once, at startup and when a viewer turns one on (default 16). Browsers allow about 16 WebGL views, one per side-by-side map, so a larger value is accepted but reported with a warning.' },
  { path: 'layout.mode', type: 'enum', values: ['scroll', 'tabs'], cascade: true, description: 'How pages are shown unless a page or the viewer says otherwise.' },
  { path: 'export.footer', type: 'boolean|string', cascade: true, description: 'Line under exported images: true (source, scenarios, year, date), false (none) or your own text.' },
  { path: 'assistant.enabled', type: 'boolean', cascade: site, description: 'Turns the AI assistant (button, panel and Settings tab) on or off.' },
  { path: 'assistant.providers', type: 'list', cascade: site, clean: cleanProviders, description: 'The AI providers the assistant tab offers, replacing the built-in ones: id, label, base_url, models, needs_key, protocol (openai or anthropic). The address of a listed provider is fixed.' },
  { path: 'assistant.default.provider', type: 'string', cascade: site, description: 'The provider the assistant tab starts on (an id from the offered providers).' },
  { path: 'assistant.default.model', type: 'string', cascade: site, description: 'The model the assistant tab starts with (any model name).' },
  { path: 'assistant.prompt_addendum', type: 'string', cascade: site, check: addendumCheck, description: 'A short plain-text note added after the assistant’s instructions (for example: Our zones are called TAZs). At most 2000 characters; the viewer does not see it.' },
  { path: 'assistant.limits.round_trips', type: 'integer', cascade: site, check: limitCheck('round_trips'), description: 'Steps the assistant may take to answer one question: 1 to 12 (default 6).' },
  { path: 'assistant.limits.preview_rows', type: 'integer', cascade: site, check: limitCheck('preview_rows'), description: 'Rows of a query result shown to the viewer: 100 to 5000 (default 1000).' },
  { path: 'assistant.limits.model_rows', type: 'integer', cascade: site, check: limitCheck('model_rows'), description: 'Rows of a result shared with the model when the viewer shares results: 1 to 200 (default 50).' },
  { path: 'docs.url', type: 'url', cascade: site, check: (v) => (isWebAddress(String(v)) ? undefined : 'expected an http or https address'), description: 'Address of the documentation site; sets a link at the foot of the left sidebar (none when unset).' },
  { path: 'docs.label', type: 'string', cascade: site, description: 'Text of the documentation link (default: Documentation).' },
  { path: 'header.docs', type: 'string', scope: 'page', cascade: false, check: (v) => (isRelativePath(String(v)) ? undefined : 'expected a path relative to the documentation address'), description: 'A page header key: a path appended to docs.url, so the sidebar link opens the section for that page.' },
  { path: 'header.hidden', type: 'boolean', scope: 'page', cascade: false, description: 'A page header key: true keeps the page out of the sidebar; it still opens at its address. The first page that is not hidden is the landing page.' },
  { path: 'settings.tabs', type: 'list', of: 'string', cascade: site, clean: cleanSettingsTabs, description: 'Settings window tabs, in order: appearance, scenarios, basemap, assistant, documentation (default: all five).' },
  { path: 'network.fonts', type: 'enum', values: NETWORK_FONT_MODES, cascade: site, description: 'bundled: the Appearance tab offers only the fonts that ship with the app (the default and System UI) and no font is loaded from an outside host. any: today’s behaviour (default).' },
  { path: 'network.basemaps.allow', type: 'list', of: 'string', cascade: site, description: 'Patterns (* is the only wildcard, letter case ignored) on basemap ids such as carto-positron, openfreemap-*, ugrc-vector-lite, protomaps-light or OpenStreetMap.Mapnik. The Basemap tab offers only matching entries and a default that does not match is replaced by the first allowed one. Empty or absent: every basemap is allowed.' },
  { path: 'network.duckdb_extensions', type: 'url', cascade: site, check: (v) => (isWebAddress(String(v)) ? undefined : 'expected an http or https address'), description: 'One http or https address the database downloads its extensions (spatial, parquet) from, instead of DuckDB’s own host. The deployer hosts the files.' },
  { path: 'basemap.default', type: 'string', cascade: true, description: 'Default basemap id (a tab or panel may choose its own).' },
  { path: 'basemap.protomaps.pmtiles_url', type: 'url', cascade: site, description: 'A self-hosted PMTiles file for the Protomaps basemaps.' },
  { path: 'basemap.protomaps.api_key', type: 'string', cascade: site, description: 'A hosted Protomaps key restricted to the site domain (never a secret token).' },
  ...EXPLORE_LIMITS.map((def): SettingDef => ({ path: `explore.limits.${def.key}`, type: 'integer', cascade: true, clean: limitClean(def.key), description: `Explore builder limit. ${limitText(def)} A panel or page may set its own; the lower level wins per key.` })),
  { path: 'explore.features', type: 'map', cascade: true, check: plainMap, description: 'Explore builder features switched on or off; maps merge per key.' },
  { path: 'explore.charts.default', type: 'string', cascade: true, description: 'The chart type a new Explore chart tab starts with; it must be one of the allowed charts (otherwise the first allowed chart is used). A lower level replaces it.' },
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
