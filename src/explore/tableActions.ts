// 065-chart-builder: what the data table can do to the query. Every action edits the one query model the builder uses, so the
// builder steps, the SQL tab and the table never disagree. The table holds no sort or filter state of its own.
import { isPickType, sortPatch, withFilter, type ColumnInfo, type FilterOp } from '@/explore/sql/queryModel'
import { update } from '@/explore/QueryBox'
import type { DataTabModel } from '@/explore/useDataTab'
import { setExplore } from '@/state/exploreState'

export interface TableCaps {
  /** Sorting works on any built query, including a summary. */
  sort: boolean
  /** Filters apply before a summary, so a summarised table cannot be filtered from its cells. */
  filter: boolean
  /** Why an action is off, for the hint. */
  reason: string
}

export function tableCaps(m: DataTabModel): TableCaps {
  if (m.isMine) return { sort: false, filter: false, reason: 'This is a saved table. Pick a source table to sort and filter.' }
  if (m.state.detached) return { sort: false, filter: false, reason: 'The builder is paused because the SQL was edited by hand.' }
  if (!m.plan) return { sort: false, filter: false, reason: '' }
  if (m.plan.group.length) return { sort: true, filter: false, reason: 'Filter in the Filter step before summarising.' }
  return { sort: true, filter: true, reason: '' }
}

export const currentSort = (m: DataTabModel): { col: string; dir: 'asc' | 'desc' } | null =>
  m.state.model.order && m.columns.some((c) => c.name === m.state.model.order) ? { col: m.state.model.order, dir: m.state.model.dir } : null

export function setSort(col: string, dir: 'asc' | 'desc' | null): void {
  update(sortPatch(col, dir))
}

/** Add a filter and open the Filter step, so the new filter is seen where it can be edited. */
export function addFilter(col: string, op: FilterOp, val: string): void {
  setExplore((s) => ({
    model: { ...s.model, where: withFilter(s.model.where, { col, op, val }) },
    detached: false, sql: '', page: 0, openStep: 'filter',
  }))
}

export function removeFilter(index: number): void {
  setExplore((s) => ({ model: { ...s.model, where: s.model.where.filter((_, i) => i !== index) }, detached: false, sql: '', page: 0 }))
}

/** A value can be filtered to in one click only on columns that hold a few distinct values. */
export const canQuickFilter = (c: ColumnInfo): boolean => isPickType(c.type)
