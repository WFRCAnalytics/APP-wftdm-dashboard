// 065-chart-builder: session state of the Explore builder. Plain module state with subscribe (never Web Storage): it
// survives tab switches and is gone on reload, by design. Export/import of a chart configuration is how work is kept.
import { useSyncExternalStore } from 'react'
import type { DataType } from '@/charts/builder/columnTypes'
import type { ChartSpec } from '@/charts/builder/spec'
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
  fieldQuery: string
  fieldType: DataType | 'all'
  fieldShow: number
  fieldOpen: Record<string, boolean>
  /** A short message under the chart controls (a refused drop, a switched mark). */
  notice: string
  noticeBad: boolean
}

const initial = (): ExploreState => ({
  scenarios: [], table: '', model: emptyModel(), detached: false, sql: '', queryTab: 'builder', openStep: 'table', page: 0, pageSize: 12,
  typeOverride: {}, profileCol: null, profileQuery: '', profileType: 'all', profileShow: 40, mine: [], nextId: 1, runNonce: 0,
  charts: [], activeTab: 'data', railTab: 'chart', selectedField: null, fieldQuery: '', fieldType: 'all', fieldShow: 60, fieldOpen: {}, notice: '', noticeBad: false,
})

let state: ExploreState = initial()
const subscribers = new Set<() => void>()

export const getExplore = (): ExploreState => state
export function subscribeExplore(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function setExplore(patch: Partial<ExploreState> | ((s: ExploreState) => Partial<ExploreState>)): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  for (const fn of subscribers) fn()
}

/** Changing the table or scenarios starts the query over. */
export function resetQuery(patch: Partial<ExploreState> = {}): Partial<ExploreState> {
  return { model: emptyModel(), detached: false, sql: '', page: 0, profileCol: null, profileQuery: '', profileType: 'all', profileShow: 40, ...patch }
}

export function resetExploreForTests(): void {
  state = initial()
}

export function useExplore(): ExploreState {
  return useSyncExternalStore(subscribeExplore, getExplore, getExplore)
}

export function updateChart(id: string, fn: (t: ChartTab) => ChartTab): void {
  setExplore((s) => ({ charts: s.charts.map((c) => (c.id === id ? fn(c) : c)) }))
}
