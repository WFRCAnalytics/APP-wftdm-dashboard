// 065-chart-builder: draws a pivot table (pivot.ts) as a real HTML table, in the manner of Excel's PivotTable and Power BI's matrix:
// nested row groups (indented, with a +/- control and their own subtotal row) and nested column groups (spanning headers, a
// subtotal column per group, collapsible), several measures side by side, a header that stays at the top, row headers that stay at
// the left, totals that stay at the right and bottom, an optional tint or data bar per cell, and click-to-sort on every heading.
// Used by the Explore builder and by custom dashboard tiles. Styling is pivotTable.css on theme tokens only. What the viewer opened,
// closed and sorted lives in `PivotState`, owned by the caller, so a redraw (hover, resize, new data) keeps it.
import '@/charts/builder/pivotTable.css'
import type { PivotTable, PNode } from '@/charts/builder/pivot'
import { tooltip } from '@/services/tooltip'

export interface PivotView {
  /** Row groups the viewer collapsed, and column groups, as path keys. */
  rows: string[]
  cols: string[]
  /** The viewer's sort: by row name, or by one measure of one column (an empty path is the grand total). Within each group. */
  sort?: { by: 'name' } & { dir: 'asc' | 'desc' } | { by: 'col'; m: number; cp: string[]; dir: 'asc' | 'desc' }
}
/** The view of each table, by table index. */
export type PivotState = Record<number, PivotView | undefined>

/** Rows a pivot draws when the deployer sets no `pivot_rows`. */
export const MAX_ROWS = 500
const SEP = '\u0002'
const k = (p: string[]) => p.join(SEP)
const SHARE: Record<string, string> = { row: 'Share of row', col: 'Share of column', total: 'Share of total' }

const el = <T extends keyof HTMLElementTagNameMap>(tag: T, cls?: string, text?: string): HTMLElementTagNameMap[T] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

export function renderPivots(tables: PivotTable[], state: PivotState, maxRows: number = MAX_ROWS): HTMLElement {
  const host = el('div', 'pvt-host')
  tables.forEach((t, i) => host.appendChild(renderPivot(t, state, i, maxRows)))
  const show = (e: MouseEvent) => {
    const t = (e.target as Element).closest?.('[data-t]')?.getAttribute('data-t')
    if (!t) { tooltip.hide(); return }
    const [title, ...rest] = t.split('~')
    tooltip.show({ title, rows: rest.map((p) => { const i = p.indexOf('='); return { k: p.slice(0, i), v: p.slice(i + 1) } }) }, e)
  }
  host.addEventListener('mouseover', show)
  host.addEventListener('mousemove', show)
  host.addEventListener('mouseleave', () => tooltip.hide())
  return host
}

interface HCell { text: string; colSpan: number; rowSpan: number; cls: string; node?: PNode; collapsed?: boolean; sort?: { m: number; cp: string[] } }
interface Unit { cp: string[]; kind: 'leaf' | 'sub' | 'total' }

/** Every group of a tree (a node with children), as path keys. */
const groupKeys = (nodes: PNode[]): string[] => nodes.flatMap((n) => (n.children.length ? [k(n.path), ...groupKeys(n.children)] : []))

function renderPivot(t: PivotTable, state: PivotState, idx: number, maxRows: number): HTMLElement {
  const M = t.measures.length
  const C = t.colLabels.length
  const subtotals = t.opts.subtotals
  const box = el('section', 'pvt')
  if (t.title) box.appendChild(el('h4', 'pvt-title', t.title))
  box.appendChild(el('p', 'pvt-sub', t.measures.map((m) => m.label).join(' · ')))
  const nested = t.rowLabels.length > 1 || C > 1
  const bar = el('div', 'pvt-bar')
  if (nested) {
    const expandAll = el('button', 'pvt-btn', 'Expand all')
    const collapseAll = el('button', 'pvt-btn', 'Collapse all')
    expandAll.type = collapseAll.type = 'button'
    expandAll.addEventListener('click', () => { view().rows = []; view().cols = []; draw() })
    collapseAll.addEventListener('click', () => { view().rows = groupKeys(t.rowTree); view().cols = groupKeys(t.colTree); draw() })
    bar.append(expandAll, collapseAll)
    box.appendChild(bar)
  }
  const scroll = el('div', 'pvt-scroll')
  scroll.tabIndex = 0
  scroll.setAttribute('role', 'region')
  scroll.setAttribute('aria-label', `${t.measures.map((m) => m.label).join(', ')} by ${t.rowLabels.join(', ')} and ${t.colLabels.join(', ')}`)
  const table = el('table', t.opts.density === 'compact' ? 'compact' : '')
  scroll.appendChild(table)
  box.appendChild(scroll)
  const note = el('p', 'pvt-note')
  box.appendChild(note)

  const view = (): PivotView => (state[idx] ??= { rows: [], cols: [] })
  const toggle = (list: 'rows' | 'cols', key: string) => {
    const v = view()
    v[list] = v[list].includes(key) ? v[list].filter((x) => x !== key) : [...v[list], key]
    tooltip.hide()
    draw()
  }

  /** Make a heading sort the rows: first click one way, second the other, third back to the table's own order. */
  const sortable = (th: HTMLElement, by: PivotView['sort'], first: 'asc' | 'desc', label: string) => {
    const cur = view().sort
    const same = (a?: PivotView['sort'], b?: PivotView['sort']) => !!a && !!b && a.by === b.by && (a.by === 'name' || (b.by === 'col' && a.m === b.m && k(a.cp) === k(b.cp)))
    th.classList.add('sortable')
    th.tabIndex = 0
    th.setAttribute('aria-label', `Sort by ${label}`)
    th.setAttribute('aria-sort', same(cur, by) ? (cur!.dir === 'asc' ? 'ascending' : 'descending') : 'none')
    if (same(cur, by)) th.appendChild(el('span', 'pvt-arrow', cur!.dir === 'asc' ? '▲' : '▼'))
    const act = (e: Event) => {
      if ((e.target as Element).closest('button')) return
      const v = view()
      const flip = first === 'asc' ? 'desc' : 'asc'
      v.sort = !same(v.sort, by) ? ({ ...by, dir: first } as PivotView['sort']) : v.sort!.dir === first ? ({ ...by, dir: flip } as PivotView['sort']) : undefined
      tooltip.hide()
      draw()
    }
    th.addEventListener('click', act)
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e) } })
  }

  function draw() {
    const keepTop = scroll.scrollTop
    const keepLeft = scroll.scrollLeft
    const v = view()
    const closedRows = new Set(v.rows)
    const closedCols = new Set(v.cols)
    table.replaceChildren()

    // ---- column headers and the units (columns) they sit over
    const H = C + (M > 1 ? 1 : 0)
    const head: HCell[][] = Array.from({ length: H }, () => [])
    const units: Unit[] = []
    const emit = (nodes: PNode[], depth: number): number => {
      let n = 0
      for (const node of nodes) {
        if (depth === C - 1) {
          head[depth].push({ text: node.name, colSpan: M, rowSpan: 1, cls: 'pvt-col', sort: M === 1 ? { m: 0, cp: node.path } : undefined })
          units.push({ cp: node.path, kind: 'leaf' })
          n += M
        } else if (closedCols.has(k(node.path))) {
          head[depth].push({ text: node.name, colSpan: M, rowSpan: C - depth, cls: 'pvt-col pvt-grouphead', node, collapsed: true, sort: M === 1 ? { m: 0, cp: node.path } : undefined })
          units.push({ cp: node.path, kind: 'sub' })
          n += M
        } else {
          const cell: HCell = { text: node.name, colSpan: 0, rowSpan: 1, cls: 'pvt-span', node, collapsed: false }
          head[depth].push(cell)
          let c = emit(node.children, depth + 1)
          if (subtotals) {
            head[depth + 1].push({ text: 'Total', colSpan: M, rowSpan: C - depth - 1, cls: 'pvt-col pvt-subhead', sort: M === 1 ? { m: 0, cp: node.path } : undefined })
            units.push({ cp: node.path, kind: 'sub' })
            c += M
          }
          cell.colSpan = Math.max(1, c)
          n += c
        }
      }
      return n
    }
    emit(t.colTree, 0)
    head[0].push({ text: 'Total', colSpan: M, rowSpan: C, cls: 'pvt-col pvt-totalhead', sort: M === 1 ? { m: 0, cp: [] } : undefined })
    units.push({ cp: [], kind: 'total' })
    const stick = M === 1

    const thead = el('thead')
    head.forEach((cells, d) => {
      const tr = el('tr')
      if (d === 0) {
        const corner = el('th', 'pvt-corner', t.rowLabels.join(' › '))
        corner.rowSpan = H
        corner.scope = 'col'
        sortable(corner, { by: 'name', dir: 'asc' }, 'asc', t.rowLabels.join(' and '))
        tr.appendChild(corner)
      }
      for (const c of cells) {
        const th = el('th', c.cls + (c.cls.includes('pvt-totalhead') && stick ? ' pvt-stick' : ''))
        th.colSpan = c.colSpan
        th.rowSpan = c.rowSpan
        th.scope = 'col'
        th.style.top = `${d * 30}px`
        const label = el('span', 'pvt-collabel', c.text)
        label.setAttribute('data-t', c.text)
        if (c.node && c.node.children.length) {
          const b = el('button', 'pvt-chev', c.collapsed ? '▸' : '▾')
          b.type = 'button'
          b.setAttribute('aria-expanded', String(!c.collapsed))
          b.setAttribute('aria-label', `${c.collapsed ? 'Expand' : 'Collapse'} ${c.text}`)
          b.addEventListener('click', (e) => { e.stopPropagation(); toggle('cols', k(c.node!.path)) })
          th.appendChild(b)
        }
        th.appendChild(label)
        if (c.sort) sortable(th, { by: 'col', m: c.sort.m, cp: c.sort.cp, dir: 'desc' }, 'desc', c.text)
        tr.appendChild(th)
      }
      thead.appendChild(tr)
    })
    if (M > 1) {
      const tr = el('tr')
      for (const u of units) {
        t.measures.forEach((me, m) => {
          const th = el('th', `pvt-col pvt-measure${u.kind !== 'leaf' ? ' pvt-subhead' : ''}`, me.label)
          th.scope = 'col'
          th.style.top = `${C * 30}px`
          sortable(th, { by: 'col', m, cp: u.cp, dir: 'desc' }, 'desc', `${me.label} ${u.cp.join(' ')}`)
          tr.appendChild(th)
        })
      }
      thead.appendChild(tr)
    }
    table.appendChild(thead)

    // ---- rows: the visible ones, in order
    const sort = v.sort
    const order = (nodes: PNode[]): PNode[] => {
      if (!sort) return nodes
      const dir = sort.dir === 'asc' ? 1 : -1
      return nodes.slice().sort((a, b) => {
        if (sort.by === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true }) * dir
        const x = t.shown(sort.m, a.path, sort.cp), y = t.shown(sort.m, b.path, sort.cp)
        if (x === null && y === null) return 0
        if (x === null) return 1
        if (y === null) return -1
        return (x - y) * dir
      })
    }
    const visible: { node: PNode; depth: number }[] = []
    const walk = (nodes: PNode[], depth: number) => {
      for (const node of order(nodes)) {
        visible.push({ node, depth })
        if (node.children.length && !closedRows.has(k(node.path))) walk(node.children, depth + 1)
      }
    }
    walk(t.rowTree, 0)
    const shownRows = visible.slice(0, maxRows)
    note.textContent = visible.length > maxRows ? `Showing the first ${maxRows.toLocaleString('en-US')} of ${visible.length.toLocaleString('en-US')} rows. Collapse a group or filter the data to see the rest.` : ''
    note.hidden = !note.textContent

    const pathText = (p: string[]) => (p.length ? p.join(' › ') : 'All')
    const valueCell = (m: number, rp: string[], cp: string[], u: Unit, body: boolean, blank: boolean): HTMLTableCellElement => {
      const me = t.measures[m]
      const td = el('td', `pvt-cell${u.kind !== 'leaf' ? ' pvt-subcol' : ''}${u.kind === 'total' && stick ? ' pvt-stick' : ''}`)
      const x = blank ? null : t.shown(m, rp, cp)
      if (x === null) { td.classList.add('none'); td.textContent = blank ? '' : '—'; return td }
      const text = me.fmt(x)
      td.textContent = text
      const raw = t.val(m, rp, cp)
      const pairs = me.pct && raw !== null ? [`${me.label}=${me.exact(raw)}`, `${SHARE[me.show]}=${text}`] : [`${me.label}=${me.exact(x)}`]
      td.setAttribute('data-t', `${pathText(rp)} · ${pathText(cp)}~${pairs.join('~')}`)
      if (body && t.opts.cells !== 'plain') {
        const u01 = me.hi === me.lo ? 0.5 : (x - me.lo) / (me.hi - me.lo)
        if (t.opts.cells === 'shade') td.style.background = `color-mix(in srgb, var(--brand) ${Math.round(7 + 33 * u01)}%, transparent)`
        else {
          const w = Math.max(0, Math.min(100, (me.hi > 0 ? Math.max(0, x) / me.hi : 0) * 100))
          td.style.background = `linear-gradient(90deg, color-mix(in srgb, var(--brand) 26%, transparent) ${w}%, transparent ${w}%)`
        }
      }
      return td
    }

    const tbody = el('tbody')
    for (const { node, depth } of shownRows) {
      const group = node.children.length > 0
      const closed = group && closedRows.has(k(node.path))
      const tr = el('tr', group ? 'pvt-group' : '')
      const rh = el('th', 'pvt-row')
      rh.scope = 'row'
      rh.style.paddingLeft = `${12 + depth * 18}px`
      if (group) {
        const b = el('button', 'pvt-chev', closed ? '▸' : '▾')
        b.type = 'button'
        b.setAttribute('aria-expanded', String(!closed))
        b.setAttribute('aria-label', `${closed ? 'Expand' : 'Collapse'} ${node.name}`)
        b.addEventListener('click', () => toggle('rows', k(node.path)))
        rh.appendChild(b)
      } else if (t.rowTree.some((n) => n.children.length)) rh.appendChild(el('span', 'pvt-chev-gap'))
      const name = el('span', 'pvt-rowlabel', node.name)
      name.setAttribute('data-t', pathText(node.path))
      rh.appendChild(name)
      tr.appendChild(rh)
      // a group shows its subtotal on its own row, unless subtotals are off and it is open (its parts are right below)
      const blank = group && !closed && !subtotals
      for (const u of units) for (let m = 0; m < M; m++) tr.appendChild(valueCell(m, node.path, u.cp, u, !group && u.kind === 'leaf', blank))
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)

    const tfoot = el('tfoot')
    const ft = el('tr')
    const label = el('th', 'pvt-row pvt-footlabel', 'Total')
    label.scope = 'row'
    ft.appendChild(label)
    for (const u of units) for (let m = 0; m < M; m++) { const td = valueCell(m, [], u.cp, u, false, false); td.classList.add('pvt-footcell'); ft.appendChild(td) }
    tfoot.appendChild(ft)
    table.appendChild(tfoot)
    scroll.scrollTop = keepTop
    scroll.scrollLeft = keepLeft
  }
  draw()
  return box
}
