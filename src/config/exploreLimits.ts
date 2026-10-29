// The Explore builder's numeric limits (dashboard-config.yaml `explore.limits`, or a panel's `limits:`), pure: the YAML name,
// today's value and the allowed range of each. The schema rows and explore/options.ts both read this table, so they cannot drift.

export interface LimitDef {
  /** The key under `limits`. */
  key: string
  /** The value when unset; `null` means "no fixed number" (the Data tab fits the tile). */
  default: number | null
  min: number
  max: number
  /** One line for the generated reference. */
  description: string
}

export const EXPLORE_LIMITS: readonly LimitDef[] = [
  { key: 'csv_rows', default: 100_000, min: 1, max: 5_000_000, description: 'Rows a CSV export may hold.' },
  { key: 'page_size', default: null, min: 5, max: 200, description: 'Rows per page in the Data tab (unset: as many as the tile is tall).' },
  { key: 'undo_steps', default: 60, min: 1, max: 500, description: 'How many changes can be undone.' },
  { key: 'max_joins', default: 4, min: 1, max: 8, description: 'Joins the query builder allows.' },
  { key: 'chart_rows', default: 50_000, min: 100, max: 1_000_000, description: 'Groups a chart may draw before it says it is cut.' },
  { key: 'scatter_sample', default: 5_000, min: 100, max: 100_000, description: 'Points a scatter plot samples.' },
  { key: 'histogram_bins', default: 12, min: 2, max: 100, description: 'Bins of the histogram chart.' },
  { key: 'legend_series', default: 15, min: 2, max: 50, description: 'Legend values drawn before the rest are cut.' },
  { key: 'distinct_values', default: 200, min: 10, max: 5_000, description: 'Values a filter list offers.' },
  { key: 'pivot_rows', default: 500, min: 20, max: 5_000, description: 'Rows a pivot table draws.' },
]

export const limitDef = (key: string): LimitDef | undefined => EXPLORE_LIMITS.find((l) => l.key === key)

/** The documented text of a limit's range and default, for the reference. */
export function limitText(def: LimitDef): string {
  const n = (v: number) => v.toLocaleString('en-US')
  return `${def.description} ${n(def.min)} to ${n(def.max)}${def.default === null ? '' : ` (default ${n(def.default)})`}.`
}

/**
 * A number inside the range stays; one outside is pulled to the nearest end with a message (the behaviour the Explore limits
 * always had); anything that is not a finite number gives the default (or none) and a message.
 */
export function clampLimit(key: string, value: unknown): { value: number | undefined; message?: string } {
  const def = limitDef(key)
  if (!def) return { value: undefined, message: 'not a known setting' }
  const fallback = def.default ?? undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) return { value: fallback, message: 'expected a whole number' }
  const n = Math.min(def.max, Math.max(def.min, Math.round(value)))
  return n === value ? { value: n } : { value: n, message: `${value} is outside ${def.min} to ${def.max}, so ${n} is used` }
}

/** The schema `clean` hook for one limit: keeps the clamped number and reports the clamp. */
export function limitClean(key: string): (value: unknown) => { value: unknown; messages: string[] } {
  return (value) => {
    const { value: kept, message } = clampLimit(key, value)
    return { value: kept, messages: message ? [message] : [] }
  }
}
