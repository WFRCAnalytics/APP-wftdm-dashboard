// 065-chart-builder: what a deployer can set on the `explore-builder` panel in dashboard-*.yaml. Pure resolution (defaults,
// validation, table globs) plus the one module-level slot the panel fills, so non-React code (undo depth, page size) can read it.
// Every key is optional; an unset key behaves exactly as the builder always did. Contract: specs/065-chart-builder/contracts/deployer-options.md.
import { MARKS, type Mark } from '@/charts/builder/spec'
import { exploreSettings, isTree, resolve, type Tree } from '@/config'
import { getSiteSettings } from '@/state/siteSettings'

/** `pageSize` null means the Data tab fits as many rows as the tile is tall; a number fixes it. */
export interface ExploreLimits { csvRows: number; pageSize: number | null; undoSteps: number; maxJoins: number }
export interface ExploreFeatures { sqlTab: boolean; csv: boolean; copySql: boolean; importExport: boolean; myTables: boolean; undo: boolean }
export interface ColumnNote { label?: string; unit?: string; format?: string }
export interface ExploreOptions {
  limits: ExploreLimits
  features: ExploreFeatures
  /** The chart types on offer, in grid order, and the one a new tab starts with. */
  charts: { allow: Mark[]; default: Mark }
  /** Glob patterns (`*` only) on table names; `exclude` wins. Empty `include` means every table. */
  tables: { include: string[]; exclude: string[] }
  /** Display names, units and number formats by column name. */
  columns: Record<string, ColumnNote>
  /** Chart configurations (the Export format) offered as starting points. */
  presets: unknown[]
  /** What was wrong in the YAML; the bad key falls back to its default. */
  warnings: string[]
}

export const DEFAULT_LIMITS: ExploreLimits = { csvRows: 100_000, pageSize: null, undoSteps: 60, maxJoins: 4 }
export const DEFAULT_FEATURES: ExploreFeatures = { sqlTab: true, csv: true, copySql: true, importExport: true, myTables: true, undo: true }
/** A value outside its range is pulled to the nearest end, with a warning. */
const BOUNDS: Record<keyof ExploreLimits, [number, number]> = { csvRows: [1, 5_000_000], pageSize: [5, 200], undoSteps: [1, 500], maxJoins: [1, 8] }

export function defaultOptions(): ExploreOptions {
  return {
    limits: { ...DEFAULT_LIMITS }, features: { ...DEFAULT_FEATURES }, charts: { allow: [...MARKS], default: 'bar' },
    tables: { include: [], exclude: [] }, columns: {}, presets: [], warnings: [],
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null)

const LIMIT_KEYS: [string, keyof ExploreLimits][] = [['csv_rows', 'csvRows'], ['page_size', 'pageSize'], ['undo_steps', 'undoSteps'], ['max_joins', 'maxJoins']]
const FEATURE_KEYS: [string, keyof ExploreFeatures][] = [['sql_tab', 'sqlTab'], ['csv', 'csv'], ['copy_sql', 'copySql'], ['import_export', 'importExport'], ['my_tables', 'myTables'], ['undo', 'undo']]

/**
 * The panel's own keys over the site's `explore` defaults, by each key's cascade rule (src/config/resolve.ts): maps merge per key,
 * the chart and include lists are replaced by the panel's, the exclude list and presets are added to. Keys the schema does not
 * cascade (such as `charts.default`) and unknown keys stay as the panel wrote them, so they are still checked below.
 */
function withSiteDefaults(panel: Record<string, unknown>, site: Tree): Record<string, unknown> {
  if (!isTree(site.explore)) return panel
  const { explore } = resolve({ site, panel: exploreSettings(panel) }).values
  if (!isTree(explore)) return panel
  const out: Record<string, unknown> = { ...panel }
  const group = (key: 'charts' | 'tables') => (isTree(explore[key]) ? { ...(isObj(panel[key]) ? panel[key] : {}), ...(explore[key] as Tree) } : panel[key])
  for (const k of ['limits', 'features', 'columns', 'presets'] as const) if (explore[k] !== undefined) out[k] = explore[k]
  const charts = group('charts')
  if (charts !== undefined) out.charts = charts
  const tables = group('tables')
  if (tables !== undefined) out.tables = tables
  return out
}

/** Reads the panel's YAML keys. Nothing here throws: a wrong value is reported in `warnings` and the default stays. */
export function resolveExploreOptions(raw: unknown, site: Tree = getSiteSettings()): ExploreOptions {
  const o = defaultOptions()
  if (!isObj(raw)) return o
  raw = withSiteDefaults(raw, site)
  if (!isObj(raw)) return o
  const warn = (m: string) => o.warnings.push(m)

  if (raw.limits !== undefined) {
    if (!isObj(raw.limits)) warn('limits: expected a mapping.')
    else {
      for (const [yaml, key] of LIMIT_KEYS) {
        const v = raw.limits[yaml]
        if (v === undefined) continue
        if (typeof v !== 'number' || !Number.isFinite(v)) { warn(`limits.${yaml}: expected a number.`); continue }
        const [lo, hi] = BOUNDS[key]
        const n = Math.min(hi, Math.max(lo, Math.round(v)))
        o.limits[key] = n
        if (n !== v) warn(`limits.${yaml}: ${v} is outside ${lo} to ${hi}, so ${n} is used.`)
      }
      for (const k of Object.keys(raw.limits)) if (!LIMIT_KEYS.some(([y]) => y === k)) warn(`limits.${k}: not a known setting.`)
    }
  }

  if (raw.features !== undefined) {
    if (!isObj(raw.features)) warn('features: expected a mapping.')
    else {
      for (const [yaml, key] of FEATURE_KEYS) {
        const v = raw.features[yaml]
        if (v === undefined) continue
        if (typeof v !== 'boolean') warn(`features.${yaml}: expected true or false.`)
        else o.features[key] = v
      }
      for (const k of Object.keys(raw.features)) if (!FEATURE_KEYS.some(([y]) => y === k)) warn(`features.${k}: not a known setting.`)
    }
  }

  if (raw.charts !== undefined) {
    if (!isObj(raw.charts)) warn('charts: expected a mapping.')
    else {
      if (raw.charts.allow !== undefined) {
        const list = strList(raw.charts.allow)
        if (!list) warn('charts.allow: expected a list of chart names.')
        else {
          const bad = list.filter((m) => !(MARKS as readonly string[]).includes(m))
          if (bad.length) warn(`charts.allow: unknown chart ${bad.map((b) => `"${b}"`).join(', ')}. Available: ${MARKS.join(', ')}.`)
          const ok = MARKS.filter((m) => list.includes(m))
          if (ok.length) o.charts.allow = ok
          else warn('charts.allow: no known chart in the list, so every chart stays on.')
        }
      }
      if (raw.charts.default !== undefined) {
        const d = raw.charts.default
        if (typeof d === 'string' && (o.charts.allow as string[]).includes(d)) o.charts.default = d as Mark
        else warn(`charts.default: "${String(d)}" is not one of the allowed charts.`)
      }
      for (const k of Object.keys(raw.charts)) if (k !== 'allow' && k !== 'default') warn(`charts.${k}: not a known setting.`)
    }
  }
  // the default must be on offer: fall back to the first allowed chart
  if (!o.charts.allow.includes(o.charts.default)) o.charts.default = o.charts.allow[0]

  if (raw.tables !== undefined) {
    if (!isObj(raw.tables)) warn('tables: expected a mapping.')
    else {
      for (const k of ['include', 'exclude'] as const) {
        if (raw.tables[k] === undefined) continue
        const list = strList(raw.tables[k])
        if (list) o.tables[k] = list
        else warn(`tables.${k}: expected a list of table names or patterns.`)
      }
      for (const k of Object.keys(raw.tables)) if (k !== 'include' && k !== 'exclude') warn(`tables.${k}: not a known setting.`)
    }
  }

  if (raw.columns !== undefined) {
    if (!isObj(raw.columns)) warn('columns: expected a mapping of column name to label, unit and format.')
    else {
      for (const [name, v] of Object.entries(raw.columns)) {
        if (!isObj(v)) { warn(`columns.${name}: expected a mapping.`); continue }
        const note: ColumnNote = {}
        for (const k of ['label', 'unit', 'format'] as const) {
          if (v[k] === undefined) continue
          if (typeof v[k] === 'string' && (v[k] as string).trim()) note[k] = (v[k] as string).trim()
          else warn(`columns.${name}.${k}: expected text.`)
        }
        o.columns[name] = note
      }
    }
  }

  if (raw.presets !== undefined) {
    if (!Array.isArray(raw.presets)) warn('presets: expected a list of chart configurations.')
    else o.presets = raw.presets
  }
  return o
}

// ---------------------------------------------------------------- tables

const globRe = (g: string) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')

/** True when a table may be offered: it matches `include` (or include is empty) and does not match `exclude`. */
export function tableAllowed(name: string, t: ExploreOptions['tables']): boolean {
  if (t.exclude.some((g) => globRe(g).test(name))) return false
  return t.include.length === 0 || t.include.some((g) => globRe(g).test(name))
}

// ---------------------------------------------------------------- columns

/** The name a column shows under: the deployer's label, else the column's own name. */
export const columnLabel = (o: ExploreOptions, name: string): string => o.columns[name]?.label ?? name

/**
 * Formats a number with a small pattern: `#,##0` (thousands), `0.0` (one decimal), `0%` (percent, the value is a share),
 * `$#,##0` and a trailing/leading literal. Anything else, or a non-number, comes back as plain text.
 */
export function formatValue(v: unknown, format: string | undefined): string {
  if (v === null || v === undefined) return ''
  if (!format || !/[#0]/.test(format) || typeof v !== 'number' || !Number.isFinite(v)) return String(v)
  const m = /^([^#0,.%]*)([#0,]*)(?:\.(0+))?(%?)([^#0,.%]*)$/.exec(format)
  if (!m) return String(v)
  const [, pre, int, dec, pct, post] = m
  const n = pct ? v * 100 : v
  const digits = dec ? dec.length : 0
  const text = n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: int.includes(',') })
  return `${pre}${text}${pct}${post}`
}

// ---------------------------------------------------------------- the slot the panel fills

let current: ExploreOptions = defaultOptions()
export const getExploreOptions = (): ExploreOptions => current
export function setExploreOptions(o: ExploreOptions): void { current = o }
export const resetExploreOptionsForTests = (): void => { current = defaultOptions() }
