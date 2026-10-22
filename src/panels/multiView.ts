// Pure logic for the `multi-view` tile (project-docs/redesign/06-data-and-config.md section 7): validation, `$group`
// substitution and resolution of the active view into an ordinary panel config. No React, no stores.
import type {
  CompareStrategy,
  MultiViewGroupOption,
  MultiViewPanelConfig,
  MultiViewViewConfig,
  PanelConfig,
} from '../layout/types.ts'

export const COMPARE_STRATEGIES: readonly CompareStrategy[] = ['overlay', 'diff', 'multi', 'grid', 'switch', 'swipe']

/** The strategy matrix of file 03 section 4.1, by panel type (first = default). */
const DEFAULT_STRATEGIES: Record<string, CompareStrategy[]> = {
  treemap: ['multi', 'diff'],
  sunburst: ['multi'],
  sankey: ['switch'],
  pie: ['switch', 'diff'],
  radar: ['overlay'],
  'observable-plot': ['overlay'],
  table: ['overlay'],
  zonemap: ['grid', 'switch'],
  flowmap: ['switch'],
  chart: ['overlay'],
  valuebox: [],
  markdown: [],
}

export const STRATEGY_LABEL: Record<CompareStrategy, string> = {
  overlay: 'Overlay',
  diff: 'Difference',
  multi: 'Side by side',
  grid: 'Side by side',
  switch: 'One at a time',
  swipe: 'Swipe',
}

export function defaultStrategies(type: string): CompareStrategy[] {
  return DEFAULT_STRATEGIES[type] ?? ['overlay']
}

const GROUP_REF = /^\$group\.([A-Za-z_][\w]*)$/

/** Keys a view carries for the wrapper only; they never reach the panel component. */
const VIEW_ONLY_KEYS = new Set(['id', 'label', 'compare', 'scenario_independent', 'base_year_only', 'family', 'needs_compare', 'diff'])

function groupRefsIn(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    const m = GROUP_REF.exec(value)
    if (m) out.add(m[1])
  } else if (Array.isArray(value)) {
    for (const v of value) groupRefsIn(v, out)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) groupRefsIn(v, out)
  }
}

/**
 * Load-time validation. Returns a precise message for the first problem, or null when the config is usable.
 * Never throws; the tile shows the message in the ordinary panel error state.
 */
export function validateMultiView(config: MultiViewPanelConfig): string | null {
  const name = `"${config.title}"`
  if (!Array.isArray(config.views) || config.views.length === 0) return `${name}: multi-view needs a non-empty views list`

  const seen = new Set<string>()
  for (const [i, view] of config.views.entries()) {
    if (!view || typeof view !== 'object') return `${name}: view ${i + 1} is not an object`
    if (typeof view.id !== 'string' || view.id.length === 0) return `${name}: view ${i + 1} has no id`
    if (typeof view.type !== 'string' || view.type.length === 0) return `${name}: view "${view.id}" has no type`
    if (view.type === 'multi-view') return `${name}: view "${view.id}" cannot itself be a multi-view`
    if (seen.has(view.id)) return `${name}: duplicate view id "${view.id}"`
    seen.add(view.id)
    if (view.compare !== undefined) {
      if (!Array.isArray(view.compare)) return `${name}: view "${view.id}" compare must be a list`
      for (const s of view.compare) {
        if (!COMPARE_STRATEGIES.includes(s)) {
          return `${name}: view "${view.id}" has unknown compare strategy "${String(s)}" (expected one of ${COMPARE_STRATEGIES.join(', ')})`
        }
      }
    }
  }

  const options = config.group_by?.options
  if (config.group_by) {
    if (!Array.isArray(options) || options.length === 0) return `${name}: group_by needs a non-empty options list`
    const ids = new Set<string>()
    for (const [i, opt] of options.entries()) {
      if (typeof opt?.id !== 'string' || opt.id.length === 0) return `${name}: group_by option ${i + 1} has no id`
      if (ids.has(opt.id)) return `${name}: duplicate group_by option id "${opt.id}"`
      ids.add(opt.id)
    }
    if (config.group_by.default !== undefined && !ids.has(config.group_by.default)) {
      return `${name}: group_by.default "${config.group_by.default}" is not one of the options`
    }
  }

  // A `$group.<field>` that no option defines can never resolve.
  const defined = new Set<string>()
  for (const opt of options ?? []) for (const f of Object.keys(opt.fields ?? {})) defined.add(f)
  for (const view of config.views) {
    const refs = new Set<string>()
    groupRefsIn(view, refs)
    for (const f of refs) {
      if (!defined.has(f)) {
        return `${name}: view "${view.id}" uses $group.${f} but no group_by option defines "${f}"`
      }
    }
  }
  return null
}

/** Replaces whole-string `$group.<field>` values from `fields`; a field the option does not define stays unset. */
export function substituteGroup(value: unknown, fields: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const m = GROUP_REF.exec(value)
    if (!m) return value
    return Object.prototype.hasOwnProperty.call(fields, m[1]) ? fields[m[1]] : undefined
  }
  if (Array.isArray(value)) return value.map((v) => substituteGroup(v, fields))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const next = substituteGroup(v, fields)
      if (next !== undefined) out[k] = next
    }
    return out
  }
  return value
}

export interface TileSelection {
  view?: string
  group?: string
  strategy?: CompareStrategy
}

export interface ResolvedMultiView {
  view: MultiViewViewConfig
  /** The views the switcher offers: a view flagged `needs_compare` is left out while Compare is off. */
  visibleViews: MultiViewViewConfig[]
  groupOption?: MultiViewGroupOption
  /** The active view as an ordinary panel config (tile defaults applied, `$group` substituted). */
  panel: PanelConfig
  strategies: CompareStrategy[]
  /** The chosen strategy, or the view's default; undefined when the view does not vary by scenario. */
  strategy?: CompareStrategy
  /** The view does not vary by scenario: it declares `compare: []` or `scenario_independent`. */
  scenarioIndependent: boolean
}

/** Chooses the active view and group from the tile selection, falling back to the first view and the default group. */
export function resolveMultiView(
  config: MultiViewPanelConfig,
  selection: TileSelection = {},
  opts: { compare?: boolean } = {},
): ResolvedMultiView {
  const offered = config.views.filter((v) => !(v.needs_compare && opts.compare === false))
  const visibleViews = offered.length > 0 ? offered : config.views
  const view =
    visibleViews.find((v) => v.id === selection.view) ??
    visibleViews.find((v) => v.id === config.default_view) ??
    visibleViews[0]
  const options = config.group_by?.options ?? []
  const groupOption =
    options.find((o) => o.id === selection.group) ??
    options.find((o) => o.id === config.group_by?.default) ??
    options[0]

  const defaults: Record<string, unknown> = {
    title: config.title,
    metric: config.metric,
    height: config.height,
    scenario: config.scenario,
    scenarios: config.scenarios,
    filter: config.filter,
  }
  const own: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(view)) if (!VIEW_ONLY_KEYS.has(k)) own[k] = v
  const fields = groupOption?.fields ?? {}
  const merged: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(defaults)) if (v !== undefined) merged[k] = v
  Object.assign(merged, substituteGroup(own, fields) as Record<string, unknown>)
  // the active option's fields are merged into the view's config (a field the view already sets wins)
  for (const [k, v] of Object.entries(fields)) if (!(k in own)) merged[k] = v

  const strategies = view.compare ?? defaultStrategies(view.type)
  const scenarioIndependent = Boolean(view.scenario_independent ?? config.scenario_independent) || strategies.length === 0
  const strategy =
    scenarioIndependent ? undefined : strategies.includes(selection.strategy as CompareStrategy) ? selection.strategy : strategies[0]
  return { view, visibleViews, groupOption, panel: merged as unknown as PanelConfig, strategies, strategy, scenarioIndependent }
}

/** The tile with a `height_rows` rule resolved to a plain `height` for `scenarioCount` compared scenarios. */
export function withRowHeight(config: MultiViewPanelConfig, scenarioCount: number): MultiViewPanelConfig {
  const r = config.height_rows
  if (!r) return config
  return { ...config, height: Math.min(r.max, r.base + r.per * Math.max(1, scenarioCount)) }
}

/** Every view as a panel config (default group): what a tab will need to load. */
export function allViewConfigs(config: MultiViewPanelConfig): PanelConfig[] {
  if (validateMultiView(config) !== null) return []
  return config.views.map((v) => resolveMultiView(config, { view: v.id }).panel)
}

/** True when the tile (or its active view) is measured on the base year only. */
export function isBaseYearOnly(config: MultiViewPanelConfig, view: MultiViewViewConfig): boolean {
  return Boolean(view.base_year_only ?? config.base_year_only)
}

/** True when the tile reads the calibration-rounds family roll-up. */
export function isCalibrationFamily(config: MultiViewPanelConfig, view?: MultiViewViewConfig): boolean {
  return (view?.family ?? config.family) === 'calibration'
}
