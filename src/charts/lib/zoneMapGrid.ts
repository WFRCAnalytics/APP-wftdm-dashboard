// Side-by-side zone maps (project-docs/redesign/04-chart-catalogue.md section 22): the cells of a CompareHost grid are
// separate chart panels, so the maps find each other through the grid element (`.wf-multi`). One group per grid links
// the cameras (CameraGroup with a re-entrancy guard), owns the shared control group top-right and syncs the hover
// outline plus ONE tooltip listing every scenario. The camera is remembered on the group, which lives as long as the
// grid element, so it survives redraws and paging.
import { linkedControls } from '@/charts/lib/mapChrome'
import { CameraGroup, type Camera } from '@/charts/lib/mapMath'
import type { ZoneMap } from '@/charts/lib/zoneMapView'
import { syncRows, type SyncCell } from '@/panels/gridSync'
import { tooltip } from '@/services/tooltip'

export interface GridMember {
  map: ZoneMap
  /** The grid cell (`[data-s]`) holding this map: its position among the cells orders the tooltip rows. */
  cell: HTMLElement
  run: string
  label: string
  color: string
  /** True when this cell shows the reference run (the first cell, whose values the others are compared with). */
  isReference: boolean
  /** The formatted value and its number for a zone, when this scenario has one. */
  value(id: number): { val: string; num: number } | undefined
}

export class GridGroup {
  readonly cameras = new CameraGroup<ZoneMap>()
  readonly members = new Set<GridMember>()
  home: Pick<Camera, 'center' | 'zoom'> | undefined
  selected: number | null = null
  private bar: HTMLElement | null = null

  constructor(readonly grid: HTMLElement) {}

  join(member: GridMember): void {
    this.members.add(member)
    this.cameras.add(member.map)
    this.cameras.last ??= member.map.getCamera()
    this.home ??= member.map.home
    member.map.home = this.home
    this.ensureBar()
  }

  leave(member: GridMember): void {
    this.members.delete(member)
    this.cameras.remove(member.map)
    if (this.members.size === 0 && this.bar) {
      this.bar.remove()
      this.bar = null
    }
    this.hover(null, null)
  }

  /** The shared control group, appended once to the grid (positioned top-right over its cells). */
  private ensureBar(): void {
    if (this.bar?.isConnected) return
    this.grid.style.position = 'relative'
    this.bar = linkedControls({
      zoomIn: () => this.first()?.map.zoomBy(1.6),
      zoomOut: () => this.first()?.map.zoomBy(1 / 1.6),
      reset: () => this.first()?.map.resetView(),
    })
    this.grid.appendChild(this.bar)
  }

  private ordered(): GridMember[] {
    const cells = [...this.grid.children]
    return [...this.members].sort((a, b) => cells.indexOf(a.cell) - cells.indexOf(b.cell))
  }

  private first(): GridMember | undefined {
    return this.ordered()[0]
  }

  /** Outlines `id` (ink, 2.4px) in every cell and shows one tooltip; null clears both. */
  hover(id: number | null, event: MouseEvent | null): void {
    for (const m of this.members) m.map.setOutline(id, 2.4, this.selected)
    if (id === null || !event) {
      tooltip.hide()
      return
    }
    const members = this.ordered()
    const withRef = members[0]?.isReference === true
    const cells: SyncCell[] = members.map((m) => {
      const v = m.value(id)
      return { run: m.run, color: m.color, val: v?.val, num: v?.num }
    })
    const labels = new Map(members.map((m) => [m.run, m.label]))
    const label = (run: string) => labels.get(run) ?? run
    let rows
    let more = 0
    if (withRef) {
      ;({ rows, more } = syncRows(cells, label, { rel: false, unit: ' pts' }))
    } else {
      rows = cells.filter((c) => c.val !== undefined).slice(0, 8).map((c) => ({ k: label(c.run), v: c.val as string, c: c.color }))
      more = Math.max(0, cells.filter((c) => c.val !== undefined).length - 8)
    }
    tooltip.showSynced(
      { title: `TAZ ${id}`, sub: `${cells.filter((c) => c.val !== undefined).length} scenarios`, rows, foot: more ? `${more} more not shown` : undefined },
      event,
    )
  }

  /** Click pins (or, on the same zone, unpins) the outline in every cell. */
  select(id: number | null): void {
    this.selected = id === this.selected ? null : id
    for (const m of this.members) m.map.setOutline(null, 2.4, this.selected)
  }
}

const groups = new WeakMap<HTMLElement, GridGroup>()

/** The group of the side-by-side grid containing `el`, or undefined when `el` is not in one. */
export function gridGroupFor(el: HTMLElement): { group: GridGroup; cell: HTMLElement } | undefined {
  const grid = el.closest<HTMLElement>('.wf-multi')
  const cell = el.closest<HTMLElement>('[data-s]')
  if (!grid || !cell) return undefined
  let group = groups.get(grid)
  if (!group) {
    group = new GridGroup(grid)
    groups.set(grid, group)
  }
  return { group, cell }
}
