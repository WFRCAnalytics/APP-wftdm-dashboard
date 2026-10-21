// Synced hover across the cells of a side-by-side grid (project-docs/redesign/05-tooltips-and-interaction.md section 4).
// Every hoverable mark inside a cell carries data-key (identical across cells), data-title, data-val, data-num and,
// optionally, data-rel ("1" when differences are relative) and data-unit. Hovering a mark outlines the same item in
// every cell and shows ONE tooltip listing each scenario's value and its change from the reference (the first cell).
import { tooltip, type TipRow } from '@/services/tooltip'

const MAX_ROWS = 8

export interface SyncCell {
  run: string
  color: string
  /** data-val and data-num of the hovered item in this cell; absent when the cell has no such item. */
  val?: string
  num?: number
}

/** Pure: the tooltip rows for one hovered item. The reference is cells[0]; deltas are absolute or, when `rel`, percent. */
export function syncRows(
  cells: readonly SyncCell[],
  label: (run: string) => string,
  opts: { rel: boolean; unit: string },
): { rows: TipRow[]; more: number } {
  const refNum = cells[0]?.num
  const all: TipRow[] = []
  cells.forEach((cell, i) => {
    if (cell.val === undefined || cell.num === undefined) return
    let d = ''
    if (i > 0 && refNum !== undefined && Number.isFinite(refNum)) {
      const delta = opts.rel ? (refNum ? (cell.num / refNum - 1) * 100 : 0) : cell.num - refNum
      d = `${delta > 0.005 ? '+' : delta < -0.005 ? '−' : ''}${Math.abs(delta).toFixed(1)}${opts.rel ? '%' : opts.unit}`
    }
    all.push({ k: label(cell.run) + (i === 0 ? ' · reference' : ''), v: cell.val, c: cell.color, b: i === 0, d })
  })
  return { rows: all.slice(0, MAX_ROWS), more: Math.max(0, all.length - MAX_ROWS) }
}

/** Wires the grid; returns a disposer. The grid element must have class `wf-multi` and cells with data-s and data-c. */
export function syncGrid(grid: HTMLElement, label: (run: string) => string): () => void {
  const cells = () => [...grid.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.s !== undefined)

  const clear = () => {
    grid.classList.remove('syncing')
    grid.querySelectorAll('.sync').forEach((x) => x.classList.remove('sync'))
    tooltip.hide()
  }

  const onMove = (e: MouseEvent) => {
    const t = e.target instanceof Element ? (e.target.closest('[data-key]') as HTMLElement | null) : null
    if (!t || !grid.contains(t)) return clear()
    const key = t.dataset.key
    const cs = cells()
    const hits = cs.map((cell) => [...cell.querySelectorAll<HTMLElement>('[data-key]')].filter((x) => x.dataset.key === key))
    grid.classList.add('syncing')
    grid.querySelectorAll('.sync').forEach((x) => x.classList.remove('sync'))
    hits.forEach((arr) => arr.forEach((x) => x.classList.add('sync')))
    const syncCells: SyncCell[] = cs.map((cell, i) => {
      const m = hits[i]?.[0]
      return { run: cell.dataset.s ?? '', color: cell.dataset.c ?? '', val: m?.dataset.val, num: m ? Number(m.dataset.num) : undefined }
    })
    const { rows, more } = syncRows(syncCells, label, { rel: t.dataset.rel === '1', unit: t.dataset.unit ?? '' })
    tooltip.showSynced(
      { title: t.dataset.title, sub: `${syncCells.filter((c) => c.val !== undefined).length} scenarios`, rows, foot: more ? `${more} more not shown` : undefined },
      e,
    )
  }

  grid.addEventListener('mousemove', onMove)
  grid.addEventListener('mouseleave', clear)
  return () => {
    grid.removeEventListener('mousemove', onMove)
    grid.removeEventListener('mouseleave', clear)
    clear()
  }
}
