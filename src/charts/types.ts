// The contract between the `chart` panel (panels/ChartPanel.tsx) and the drawing modules in src/charts/kinds/*
// (project-docs/redesign/04-chart-catalogue.md). A kind never touches stores or DuckDB: the panel resolves which
// runs to show, loads their tables, builds a ChartEnv and calls `draw`.
import type { ChartPanelConfig } from '@/layout/types'
import type { ColorTokens } from '@/panels/chartColor'
import type { DisplayMode } from '@/state/compareState'

export type Row = Record<string, unknown>

/** One compared run. `run` is the folder name (the table prefix), `scenarioGroup` the UI identity. */
export interface ChartScenario {
  run: string
  scenarioGroup: string
  /** Display label (viewer override, else manifest display name). */
  label: string
  /** Resolved colour, a concrete hex. */
  color: string
  isFocus: boolean
  /** Calibration round number (1-based) when the run is a round of a family. */
  round?: number
}

export interface ChartReference {
  kind: 'observed' | 'scenario' | 'self-base-year'
  /** The reference's run for the current year; undefined for self-base-year (it is per compared run) or no reference. */
  run?: string
  /** "Observed", a scenario label, or "the 2023 run". */
  label: string
  isObserved: boolean
}

/** Resolved colour tokens and helpers, read once per draw from the mounted element (05 / 01 section 5.4). */
export interface ChartTheme {
  ink: string
  mute: string
  line: string
  grid: string
  surface: string
  font: string
  /** Axis text size in px (11.5 at zoom 1). */
  fs: number
  /** Corner radius for bars and cells in px (--chart-r). */
  r: number
  dark: boolean
  tokens: ColorTokens
  /** Travel-mode colour by name. */
  mode(name: string): string
  /** Categorical colour i (purposes, submodels, districts). */
  cat(i: number): string
  /** Sequential single-hue ramp from a pale tint up to `color`. */
  ramp(color: string, n: number, lo?: number): string[]
  /** Neutral shade i (group rings, neutral nodes): mix(surface, ink, .2 + .08 i). */
  neutral(i: number): string
  /** Diverging fill for t in -1..1: c2 below, neutral at 0, c1 above. Never green/red. */
  diverge(t: number): string
  mix(a: string, b: string, t: number): string
  /** Text colour readable on `fill`. */
  onColor(fill: string): string
}

export interface ChartData {
  /** Rows of `table` for `run`; [] when the run has no such table. */
  rows(run: string, table: string): Row[]
  has(run: string, table: string): boolean
}

/** What a kind can know before any table is loaded; used to decide which tables and runs to load. */
export interface ChartPlan {
  config: ChartPanelConfig
  /** The compared runs in order (the focus alone when Compare is off or this panel is one cell of a grid). */
  scenarios: ChartScenario[]
  focus?: ChartScenario
  reference: ChartReference
  /** Reference run for a compared run: the global reference run, or each run's own base-year run for self-base-year. */
  refRunFor(run: string): string | undefined
  display: DisplayMode
  year: number
  baseYear: number
  isBaseYear: boolean
  /** Model years of the deployment, ascending; [] for a single-year deployment. */
  years: { year: number; label: string }[]
  compare: boolean
  group: string
  /** True when drawn as one cell of a side-by-side grid (pinned to one run; values only). */
  pinned: boolean
  /** The run name of a compared scenario group in a given year, when it exists. */
  runFor(scenarioGroup: string, year: number): string | undefined
  /** Every calibration round of the deployment (base year), in round order, selected or not. */
  rounds: { round: number; run: string; scenarioGroup: string; label: string; color: string }[]
  /** The Observed run (base year), when the deployment has one. */
  observedRun?: string
}

export interface ChartEnv extends ChartPlan {
  width: number
  height: number
  data: ChartData
  theme: ChartTheme
  /** Per-panel scratch state that survives redraws (sort order, zoom, selection). Call redraw() after changing it. */
  state: Record<string, unknown>
  redraw(): void
  setYear(year: number): void
  /** Focus a scenario group (picker semantics), e.g. a click on a legend or row. */
  focusScenarioGroup(scenarioGroup: string): void
  /** Shift-click semantics: toggle a scenario group in the compare set. */
  toggleCompare(scenarioGroup: string): void
  /** Whatever the kind's `loadExtra` returned (e.g. the calibration roll-up rows). */
  extra: unknown
}

export interface LegendItem {
  label: string
  color?: string
  /** A dashed ink sample (the reference line). */
  dash?: boolean
  /** Hovering the chip cross-highlights this mode everywhere (data-m). */
  mode?: string
  /** Hovering the chip isolates this run in the tile (fill/stroke colour match). */
  run?: string
}

export interface LegendSpec {
  items: LegendItem[]
  /** A diverging gradient key: "Lower than X [gradient] Higher". */
  diverge?: { lowLabel: string; highLabel: string; low: string; mid: string; high: string }
}

export interface ChartResult {
  legend?: LegendSpec
  dispose?: () => void
  /** Text for the chart region's aria-label. */
  label?: string
}

export interface ChartKind {
  /** Metric tables the kind reads. */
  tables(plan: ChartPlan): string[]
  /** Runs to load beyond the compared runs, the reference and the focus (e.g. every year of each scenario group). */
  extraRuns?(plan: ChartPlan): string[]
  /** Draws into `el`, replacing its children. May return a legend, a disposer and an aria label. A kind that owns an
   * expensive object (a MapLibre map) keeps it in `env.state` and reuses it on the next draw. */
  draw(el: HTMLElement, env: ChartEnv): ChartResult | void
  /** Loads data that is not a per-run table (a family roll-up); handed to `draw` as `env.extra`. */
  loadExtra?(plan: ChartPlan): Promise<unknown>
  /** The flat tables behind the drawing, when they differ from the source tables (default: the kind's `tables()` for every
   * compared run). Used by the tile's Export menu. */
  exportRows?(plan: ChartPlan, data: ChartData): { name: string; rows: Row[] }[]
  /** Called once when the panel unmounts, with the panel's persistent `state` (e.g. `map.remove()`). */
  destroy?(state: Record<string, unknown>): void
}
