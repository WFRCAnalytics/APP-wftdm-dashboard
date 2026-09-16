import type { HierarchicalPanelConfigBase } from '@/layout/types'

// 058-hierarchical-chart-panels — pure, DOM-free transform: tidy SQL rows
// (this app's own universal query-result shape) grouped by config.path (an
// ordered, root-to-leaf list of real column names) into a nested structure
// d3.hierarchy() can consume directly. Split out of HierarchicalChartHost.tsx
// for the same reason every other pure-logic module in this directory is
// (rechartsEncoding.ts, sankeyGraph.ts, flowmapData.ts,
// observablePlotEncoding.ts) — easy Vitest coverage with no DOM/React
// renderer needed. See data-model.md §4 and research.md §4.

export interface HierarchyNode {
  name: string
  // Present ONLY on a leaf node — the real, summed `value` column for that
  // (path-tuple) group. A non-leaf node's own total is derived by
  // d3.hierarchy().sum() from its descendants, never set directly here
  // (avoids double-counting).
  value?: number
  // Present on every non-leaf node; ABSENT (not an empty array) on a leaf —
  // d3.hierarchy()'s own convention for distinguishing "no children" from
  // "children not yet computed."
  children?: HierarchyNode[]
}

/**
 * @param rows tidy query result rows (buildPanelQuery()'s own output)
 * @param config only `path`/`value` are read
 */
export function buildHierarchy(
  rows: readonly Record<string, unknown>[],
  config: Pick<HierarchicalPanelConfigBase, 'path' | 'value'>,
): HierarchyNode {
  return { name: 'root', children: groupLevel(rows, config.path, config.value, 0) }
}

function groupLevel(
  rows: readonly Record<string, unknown>[],
  path: readonly string[],
  valueColumn: string,
  depth: number,
): HierarchyNode[] {
  // Groups are built in FIRST-SEEN order (never re-sorted) so rendering is
  // deterministic and stable across re-renders of the same query result —
  // matching rechartsEncoding.ts's own identical seriesKeys convention.
  const groupsByKey = new Map<string, Record<string, unknown>[]>()
  const order: string[] = []
  for (const row of rows) {
    const key = String(row[path[depth]])
    let group = groupsByKey.get(key)
    if (!group) {
      group = []
      groupsByKey.set(key, group)
      order.push(key)
    }
    group.push(row)
  }

  const isLeafLevel = depth === path.length - 1

  return order.map((key) => {
    const groupRows = groupsByKey.get(key)!
    if (!isLeafLevel) {
      return { name: key, children: groupLevel(groupRows, path, valueColumn, depth + 1) }
    }
    // Leaf level: SUM value across any rows still sharing the same full
    // path tuple (a real, defensive case — matches this app's own
    // established "aggregate, don't assume pre-aggregated" discipline).
    // A missing/non-numeric value contributes 0 to that sum (FR-009),
    // never NaN and never a dropped row.
    const total = groupRows.reduce((sum, row) => {
      const raw = row[valueColumn]
      const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
      return sum + (Number.isFinite(num) ? num : 0)
    }, 0)
    return { name: key, value: total }
  })
}
