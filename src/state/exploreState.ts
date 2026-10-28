// 065-chart-builder: session state of the Explore builder. Plain module state with subscribe (never Web Storage): it
// survives tab switches and is gone on reload, by design. Export/import of a chart configuration is how work is kept.
import { useSyncExternalStore } from 'react'
import type { DataType } from '@/charts/builder/columnTypes'
import type { ChartSpec } from '@/charts/builder/spec'
import { getExploreOptions } from '@/explore/options'
import { emptyModel, type ColumnInfo, type QueryModel } from '@/explore/sql/queryModel'

export interface MyTable {
  id: string
  /** `xb_<slug>`: the reserved prefix keeps a saved name from shadowing an app view. */
  name: string
  sql: string
  columns: ColumnInfo[]
  rowCount: number
}

export interface ChartTab {
  id: string
  name: string
  /** `t:<table>` or `m:<id>`: each chart tab holds its own data source. */
  source: string
  spec: ChartSpec
}

export type RailTab = 'chart' | 'style' | 'axes' | 'filter'

export interface ExploreState {
  /** Selected scenarios; empty until the registry has scenarios to pick from. */
  scenarios: string[]
  /** `t:<table>` for a source table, `m:<id>` for a saved table. */
  table: string
  model: QueryModel
  /** True once the SQL text was edited beyond what the builder can express. */
  detached: boolean
  /** The hand-edited SQL, used while detached. */
  sql: string
  queryTab: 'builder' | 'sql'
  /** The open step of the query builder (an accordion): table, joinN, addjoin, filter, summary or cols; empty when all are shut. */
  openStep: string
  page: number
  pageSize: number
  typeOverride: Record<string, DataType>
  profileCol: string | null
  profileQuery: string
  profileType: DataType | 'all'
  profileShow: number
  mine: MyTable[]
  nextId: number
  /** Bumped by the Run button to run the same SQL again. */
  runNonce: number
  charts: ChartTab[]
  /** `data` or a chart tab id. */
  activeTab: string
  railTab: RailTab
  selectedField: string | null
  /** The field being dragged right now. Kept apart from selectedField, which makes the builder profile the column (database queries). */
  dragField: string | null
  /** The shelf a placed field is being dragged from (null when it comes from the field list). */
  dragFrom: string | null
  fieldQuery: string
  fieldType: DataType | 'all'
  fieldShow: number
  fieldOpen: Record<string, boolean>
  /** A short message under the chart controls (a refused drop, a switched mark). */
  notice: string
  noticeBad: boolean
  /** How many chart changes can be undone and redone (see setExplore). */
  undoDepth: number
  redoDepth: number
}

const initial = (): ExploreState => ({
  scenarios: [], table: '', model: emptyModel(), detached: false, sql: '', queryTab: 'builder', openStep: 'table', page: 0, pageSize: 12,
  typeOverride: {}, profileCol: null, profileQuery: '', profileType: 'all', profileShow: 40, mine: [], nextId: 1, runNonce: 0,
  charts: [], activeTab: 'data', railTab: 'chart', selectedField: null, dragField: null, dragFrom: null, fieldQuery: '', fieldType: 'all', fieldShow: 60, fieldOpen: {}, notice: '', noticeBad: false, undoDepth: 0, redoDepth: 0,
})

let state: ExploreState = initial()
const subscribers = new Set<() => void>()

export const getExplore = (): ExploreState => state
export function subscribeExplore(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

// Undo and redo cover the chart tabs (their fields, settings, names, and being added or closed), not the Data tab. Every
// change to `charts` is recorded. Edits to the same setting of the same chart that follow each other within COALESCE_MS
// (typing a title) undo as one step; adding, closing or any other kind of edit always starts a new one.
const historyMax = (): number => getExploreOptions().limits.undoSteps
const COALESCE_MS = 800
const past: ChartTab[][] = []
const future: ChartTab[][] = []
let lastChange = 0
let lastKey: string | null = null

/** Names the one setting of one chart that differs between two lists of tabs, or null when it is anything else. */
function changeKey(a: ChartTab[], b: ChartTab[]): string | null {
  if (a.length !== b.length) return null
  let key: string | null = null
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    const x = a[i], y = b[i]
    if (x.id !== y.id || key !== null) return null
    const diffs: string[] = []
    for (const k of Object.keys(y) as (keyof ChartTab)[]) if (k !== 'spec' && x[k] !== y[k]) diffs.push(k)
    for (const k of Object.keys(y.spec) as (keyof ChartSpec)[]) {
      if (k === 'text') { for (const t of Object.keys(y.spec.text) as (keyof ChartSpec['text'])[]) if (x.spec.text[t] !== y.spec.text[t]) diffs.push(`text.${t}`) }
      else if (x.spec[k] !== y.spec[k]) diffs.push(k)
    }
    if (diffs.length !== 1) return null
    key = `${x.id}:${diffs[0]}`
  }
  return key
}

const depths = () => ({ undoDepth: past.length, redoDepth: future.length })

export function setExplore(patch: Partial<ExploreState> | ((s: ExploreState) => Partial<ExploreState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch
  if (p.charts && p.charts !== state.charts) {
    const now = Date.now()
    const key = changeKey(state.charts, p.charts)
    if (!past.length || key === null || key !== lastKey || now - lastChange > COALESCE_MS) {
      past.push(state.charts)
      while (past.length > historyMax()) past.shift()
    }
    lastChange = now
    lastKey = key
    future.length = 0
    state = { ...state, ...p, ...depths() }
  } else state = { ...state, ...p }
  for (const fn of subscribers) fn()
}

function travel(from: ChartTab[][], to: ChartTab[][]): void {
  const target = from.pop()
  if (!target) return
  to.push(state.charts)
  lastChange = 0
  lastKey = null
  // a restored set may no longer hold the tab that was open
  const activeTab = state.activeTab === 'data' || target.some((c) => c.id === state.activeTab) ? state.activeTab : 'data'
  state = { ...state, charts: target, activeTab, notice: '', ...depths() }
  for (const fn of subscribers) fn()
}
export const undoCharts = (): void => travel(past, future)
export const redoCharts = (): void => travel(future, past)

/** Changing the table or scenarios starts the query over. */
export function resetQuery(patch: Partial<ExploreState> = {}): Partial<ExploreState> {
  return { model: emptyModel(), detached: false, sql: '', page: 0, profileCol: null, profileQuery: '', profileType: 'all', profileShow: 40, ...patch }
}

export function resetExploreForTests(): void {
  state = initial()
  past.length = 0
  future.length = 0
  lastChange = 0
  lastKey = null
}

export function useExplore(): ExploreState {
  return useSyncExternalStore(subscribeExplore, getExplore, getExplore)
}

export function updateChart(id: string, fn: (t: ChartTab) => ChartTab): void {
  setExplore((s) => ({ charts: s.charts.map((c) => (c.id === id ? fn(c) : c)) }))
}
