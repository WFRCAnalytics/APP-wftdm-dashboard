// How a tile draws a comparison (project-docs/redesign/03-state-and-compare.md section 4), as pure functions: pick the
// effective strategy, then turn the active view's ordinary panel config into what CompareHost renders. Panel
// components stay ignorant of Compare; they receive plain configs with `scenario` pins and `comparison: diff` applied.
import type { CompareStrategy, PanelConfig } from '../layout/types.ts'
import type { DisplayMode, ReferenceSpec } from '../state/compareState.ts'
import { diffExpression } from './compareMath.ts'

/** Panel types that silently SUM across scenarios when handed an unpinned multi-scenario union (their builders ignore
 * the `scenario` column), so they are only ever drawn pinned (file 03 section 4.2). */
export const UNION_HAZARD_TYPES: ReadonlySet<string> = new Set(['treemap', 'sunburst', 'sankey', 'pie'])

/** Side-by-side cells per page: the reference plus three more. */
export const CELLS_PER_PAGE = 4

export const GRID_GAP = 10
const MIN_FORCED_ROW_CELL = 160

/** Narrowest a cell may get before it wraps to the next row: maps need more room than small charts. */
export function minCellWidth(panel: PanelConfig): number {
  const p = panel as { type: string; kind?: string }
  return p.type === 'zonemap' || p.type === 'flowmap' || /map/i.test(p.kind ?? '') ? 280 : 220
}

/**
 * Columns for a side-by-side grid, from the width it really has: as many as fit at `minCell`, never more than there are
 * cells. Four cells that fit go in one row (full height each, not half), otherwise 2x2 rather than 3+1. A tabbed page
 * already gives the tile the whole screen height, so there 2 columns is the most (2x2 reads fine); a phone gets 1.
 * A viewer's Layout choice (`row`/`grid`) overrides this. Width 0 (not yet measured) falls back to the old two-column rule.
 */
export function pickColumns({ total, width, minCell, tabbed, layout = 'auto' }: { total: number; width: number; minCell: number; tabbed: boolean; layout?: 'auto' | 'row' | 'grid' }): number {
  if (total <= 1) return 1
  // a manual choice wins, unless a row would squeeze cells below a readable width
  if (layout === 'grid') return 2
  if (layout === 'row' && (width === 0 || width >= total * MIN_FORCED_ROW_CELL + (total - 1) * GRID_GAP)) return total
  let cols = width > 0 ? Math.floor((width + GRID_GAP) / (minCell + GRID_GAP)) : 2
  if (tabbed) cols = Math.min(cols, 2)
  cols = Math.max(1, Math.min(cols, total))
  if (cols === 3 && total === 4) cols = 2
  return cols
}

export interface CompareInputs {
  compare: boolean
  display: DisplayMode
  focusRun?: string
  referenceKind: ReferenceSpec['kind']
  /** The reference's run for the current year (the Observed run, or a scenario's run). */
  referenceRun?: string
  /** The focus's run in the base year, for the "same scenario in the base year" reference. */
  selfBaseRun?: string
  /** Run names the compare set resolves to, in order. */
  active: string[]
  /** Display label for a run name. */
  label: (run: string) => string
}

export interface TileChoice {
  strategy?: CompareStrategy
  scenario?: string
  page?: number
}

/**
 * The strategy that actually draws. Compare off, a scenario-independent view or an empty list means none. Change and
 * % change mean a difference chart whenever the view offers one; otherwise the user's choice, else the first strategy.
 */
export function effectiveStrategy(opts: {
  strategies: CompareStrategy[]
  chosen?: CompareStrategy
  scenarioIndependent: boolean
  compare: boolean
  display: DisplayMode
}): CompareStrategy | undefined {
  const { strategies, chosen, scenarioIndependent, compare, display } = opts
  if (!compare || scenarioIndependent || strategies.length === 0) return undefined
  if (display !== 'val' && strategies.includes('diff')) return 'diff'
  if (chosen && strategies.includes(chosen)) return chosen
  return strategies[0]
}

export interface Cell {
  run: string
  label: string
  isReference: boolean
  config: PanelConfig
}

export type ComparePlan =
  | { kind: 'single'; config: PanelConfig; note?: string }
  | { kind: 'cells'; cells: Cell[]; page: number; pages: number; total: number; firstShown: number; lastShown: number }
  | { kind: 'empty'; message: string }

function pin(panel: PanelConfig, run: string | undefined): PanelConfig {
  if (!run) return panel
  return { ...(panel as object), scenario: run, scenarios: undefined } as PanelConfig
}

/** True when the tile author pinned the view themselves (`scenario:`/`scenarios:`): that always wins. */
function isAuthorPinned(panel: PanelConfig): boolean {
  const p = panel as { scenario?: string; scenarios?: string[] }
  return Boolean(p.scenario) || Boolean(p.scenarios && p.scenarios.length > 0)
}

type Dict = Record<string, unknown>

/**
 * The view as a difference chart: `comparison: diff` of the reference (`a`) against the shown scenario (`b`), the
 * value channel bound to `diff_value`, every other dimension channel the join key. Returns null for a type that cannot
 * show differences (it keeps showing values).
 */
export function buildDiffConfig(
  panel: PanelConfig,
  a: string,
  b: string,
  mode: Exclude<DisplayMode, 'val'>,
): PanelConfig | null {
  const p = panel as unknown as Dict & { type: string }
  const base = { ...p, scenario: undefined, scenarios: undefined } as Dict
  const diff = (column: string) => ({ type: 'diff', a, b, expr: diffExpression(column, mode) })

  switch (p.type) {
    case 'observable-plot': {
      const mark = String(p.mark ?? '')
      const channel = mark.endsWith('X') ? 'x' : mark === 'cell' ? 'fill' : 'y'
      const column = p[channel]
      if (typeof column !== 'string') return null
      const dims = ['x', 'y', 'fill', 'stroke', 'facet_x', 'facet_y']
        .filter((k) => k !== channel)
        .map((k) => p[k])
        .filter((v): v is string => typeof v === 'string' && v !== 'scenario')
      const next: Dict = { ...base, [channel]: 'diff_value', comparison: diff(column), compare_on: [...new Set(dims)] }
      if (next.fill === 'scenario') delete next.fill
      if (next.stroke === 'scenario') delete next.stroke
      return next as unknown as PanelConfig
    }
    case 'pie': {
      // a donut becomes a difference bar chart in Change mode (file 03 section 4.1)
      const category = String(p.category)
      const value = String(p.value)
      return {
        type: 'observable-plot',
        title: p.title,
        metric: p.metric,
        height: p.height,
        filter: p.filter,
        mark: 'barY',
        x: category,
        y: 'diff_value',
        tip: true,
        grid: true,
        comparison: diff(value),
        compare_on: [category],
      } as unknown as PanelConfig
    }
    case 'zonemap': {
      const column = String(p.column)
      return { ...base, comparison: diff(column) } as unknown as PanelConfig
    }
    case 'treemap': {
      // Geometry from the shown scenario, colour from its % change against the reference (areas are never negative).
      return {
        ...base,
        scenario: b,
        color_diff: { a, b, mode, expr: diffExpression(String(p.value), 'pct') },
      } as unknown as PanelConfig
    }
    default:
      return null
  }
}

/** The ordinary values-mode plan for a pinned/unpinned single panel. */
function single(panel: PanelConfig, run: string | undefined, hazard: boolean, forcePin: boolean): ComparePlan {
  return { kind: 'single', config: hazard || forcePin ? pin(panel, run) : panel }
}

/**
 * Turns the view's ordinary panel config into what to render, per strategy. `diff` needs a reference different from
 * the shown scenario; when it is not, or the type cannot show differences, the plan says why instead of drawing zeros.
 */
export function planCompare(
  panel: PanelConfig,
  strategy: CompareStrategy | undefined,
  inputs: CompareInputs,
  tile: TileChoice = {},
): ComparePlan {
  const hazard = UNION_HAZARD_TYPES.has(panel.type)
  const authorPinned = isAuthorPinned(panel)
  const focus = inputs.focusRun

  // Compare off, or a view that does not vary by scenario: the focus scenario alone.
  if (strategy === undefined) return authorPinned ? { kind: 'single', config: panel } : single(panel, focus, hazard, false)
  if (authorPinned && strategy !== 'diff' && strategy !== 'multi' && strategy !== 'grid') return { kind: 'single', config: panel }

  const mode = inputs.display

  switch (strategy) {
    case 'overlay': {
      if (hazard) {
        // An unpinned union would sum silently: draw one scenario instead.
        console.warn(`compareStrategy: "${panel.type}" cannot overlay scenarios; showing the focus scenario`)
        return single(panel, focus, true, true)
      }
      return mode === 'val' ? { kind: 'single', config: panel } : { kind: 'single', config: panel, note: 'Shows values: this view cannot show differences' }
    }
    case 'switch':
    case 'swipe': {
      const run = tile.scenario && inputs.active.includes(tile.scenario) ? tile.scenario : focus
      return single(panel, run, hazard, true)
    }
    case 'multi':
    case 'grid': {
      const runs = inputs.active
      const ref = inputs.referenceKind !== 'self-base-year' ? inputs.referenceRun : undefined
      const others = runs.filter((r) => r !== ref)
      const perPage = ref ? CELLS_PER_PAGE - 1 : CELLS_PER_PAGE
      const pages = Math.max(1, Math.ceil(others.length / perPage))
      const page = Math.min(Math.max(tile.page ?? 0, 0), pages - 1)
      const shown = others.slice(page * perPage, (page + 1) * perPage)
      const cells: Cell[] = [
        ...(ref ? [{ run: ref, label: inputs.label(ref), isReference: true, config: pin(panel, ref) }] : []),
        ...shown.map((run) => ({ run, label: inputs.label(run), isReference: false, config: pin(panel, run) })),
      ]
      if (cells.length === 0) return { kind: 'empty', message: 'Choose a scenario to compare.' }
      return { kind: 'cells', cells, page, pages, total: others.length, firstShown: page * perPage + 1, lastShown: page * perPage + shown.length }
    }
    case 'diff': {
      // a catalogue chart draws its own differences from the focus, the reference and the Show mode
      if (panel.type === 'chart') return { kind: 'single', config: panel }
      const shown = focus
      const ref = inputs.referenceKind === 'self-base-year' ? inputs.selfBaseRun : inputs.referenceRun
      if (!shown) return { kind: 'empty', message: 'The focus scenario has no run for this year.' }
      if (inputs.referenceKind === 'self-base-year' && !ref) return { kind: 'empty', message: 'No base-year run for this scenario.' }
      if (!ref || ref === shown) return { kind: 'empty', message: 'Choose a scenario other than the reference to see differences.' }
      const diffMode = mode === 'val' ? 'abs' : mode
      const config = buildDiffConfig(panel, ref, shown, diffMode)
      if (!config) return single(panel, shown, hazard, true)
      return { kind: 'single', config }
    }
  }
}
